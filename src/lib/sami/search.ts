import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";

export const SEARCH_TOOL: Anthropic.Tool = {
  name: "search_lessons",
  description:
    "Search the Secure Parent Collective lesson transcripts (what Marcela Collier and the HIC coaches said in each recorded class and coaching session). Returns the most relevant passages with the lesson title, module and link. Queries must be in English, using a few keywords.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "English keywords, e.g. 'meltdown safety calm body'" },
    },
    required: ["query"],
  },
};

type Row = { lesson: string; module: string | null; url: string | null; content: string; rank: number };

export async function searchLessons(supabase: SupabaseClient, query: string): Promise<string> {
  const q = (query ?? "").toString().slice(0, 200).trim();
  if (!q) return "No query given.";
  const { data, error } = await supabase.rpc("search_kb", { query: q, match_count: 4 });
  if (error) {
    console.error("[search_kb]", error.message);
    return "The lesson search is unavailable right now. Answer from the knowledge files.";
  }
  const rows = (data ?? []) as Row[];
  if (!rows.length) return `No passages found for "${q}". Try different English keywords or answer from the knowledge files.`;
  return rows
    .map(
      (r, i) =>
        `[${i + 1}] Lesson: ${r.lesson}${r.module ? ` | Module: ${r.module}` : ""}${r.url ? ` | Link: ${r.url}` : ""}\n${r.content.slice(0, 1200)}`,
    )
    .join("\n\n---\n\n");
}
