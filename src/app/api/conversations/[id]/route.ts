import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: conv } = await supabase.from("conversations").select("id, title").eq("id", id).maybeSingle();
  if (!conv) return Response.json({ error: "Not found" }, { status: 404 });
  const { data: messages, error } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ conversation: conv, messages: messages ?? [] });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { title } = (await req.json().catch(() => ({}))) as { title?: string };
  const clean = (title ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!clean) return Response.json({ error: "Title is required" }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.from("conversations").update({ title: clean }).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const { error } = await supabase.from("conversations").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
