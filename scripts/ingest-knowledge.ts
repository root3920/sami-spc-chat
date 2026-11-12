// Loads the lesson transcripts (knowledge/transcripts/T*.md) into Supabase table kb_chunks,
// so Sami can search what Marcela and the coaches said in each lesson.
//
// Usage (on your computer, with .env.local filled):
//   npm run ingest
// Re-run it whenever you add or change a transcript file: it replaces everything.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv(".env.local");
loadEnv(".env");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const DIR = join(process.cwd(), "knowledge", "transcripts");
const MAX_CHARS = 1800;

type Chunk = { source: string; lesson: string; module: string | null; url: string | null; chunk_index: number; content: string };

function chunkFile(source: string, text: string): Chunk[] {
  const chunks: Chunk[] = [];
  const lessons = text.split(/\n## LESSON:\s*/).slice(1);
  for (const block of lessons) {
    const lines = block.split("\n");
    const lesson = lines[0].trim();
    const module = block.match(/^Module:\s*(.+)$/m)?.[1].trim() ?? null;
    const url = block.match(/^Where to watch:\s*(\S+)/m)?.[1].trim() ?? null;
    const paragraphs = block
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.startsWith("["))
      // drop the repeated "[Lesson title]" prefix, keep the timestamp
      .map((p) => p.replace(/^\[[^\]]*\]\s*(?=\[\d)/, ""));
    let buf = "";
    let i = 0;
    for (const p of paragraphs) {
      if (buf && buf.length + p.length > MAX_CHARS) {
        chunks.push({ source, lesson, module, url, chunk_index: i++, content: buf });
        buf = "";
      }
      buf = buf ? `${buf}\n\n${p}` : p;
    }
    if (buf) chunks.push({ source, lesson, module, url, chunk_index: i++, content: buf });
  }
  return chunks;
}

async function main() {
  const files = readdirSync(DIR).filter((f) => /^T\d+.*\.md$/.test(f)).sort();
  if (!files.length) throw new Error(`No transcript files in ${DIR}`);

  const all: Chunk[] = [];
  for (const f of files) {
    const c = chunkFile(f, readFileSync(join(DIR, f), "utf8"));
    console.log(`${f}: ${c.length} chunks`);
    all.push(...c);
  }

  const { error: delError } = await supabase.from("kb_chunks").delete().gte("id", 0);
  if (delError) throw delError;

  for (let i = 0; i < all.length; i += 200) {
    const { error } = await supabase.from("kb_chunks").insert(all.slice(i, i + 200));
    if (error) throw error;
    process.stdout.write(`\rInserted ${Math.min(i + 200, all.length)}/${all.length}`);
  }
  console.log(`\nDone: ${all.length} chunks from ${files.length} files.`);
}

main().catch((err) => {
  console.error("\nIngest failed:", err.message ?? err);
  process.exit(1);
});
