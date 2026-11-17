import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { SYSTEM_PROMPT } from "@/lib/sami/prompt";
import { SEARCH_TOOL, searchLessons } from "@/lib/sami/search";
import { ERROR_MARKER } from "@/lib/sami/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
const DAILY_LIMIT = Number(process.env.DAILY_MESSAGE_LIMIT || 60);
const REQUIRE_MEMBERSHIP = process.env.REQUIRE_MEMBERSHIP === "true";
const MAX_MESSAGE_CHARS = 4000;
const HISTORY_LIMIT = 10;
const MAX_TOOL_ROUNDS = 1;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function titleFrom(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 60 ? clean.slice(0, 57).trimEnd() + "…" : clean || "New chat";
}

export async function POST(req: Request) {
  const rawKey = process.env.ANTHROPIC_API_KEY ?? "";
  const apiKey = rawKey.replace(/^[\s"']+|[\s"']+$/g, "");
  if (!apiKey) return jsonError("ANTHROPIC_API_KEY is not configured on the server.", 503);
  if (!apiKey.startsWith("sk-ant-")) console.warn("[chat] ANTHROPIC_API_KEY has an unexpected format");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Not signed in", 401);

  let body: { conversationId?: string | null; message?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request", 400);
  }
  const message = (body.message ?? "").toString().trim();
  if (!message) return jsonError("Message is required", 400);
  if (message.length > MAX_MESSAGE_CHARS) return jsonError("Message is too long", 400);

  if (REQUIRE_MEMBERSHIP) {
    const { data: isMember, error } = await supabase.rpc("is_member");
    if (error || !isMember) return jsonError("not_member", 403);
  }

  // Cost control: messages per member in the last 24 hours
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("role", "user")
    .gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) return jsonError("daily_limit", 429);

  // Conversation
  let conversationId = body.conversationId ?? null;
  if (conversationId) {
    const { data: conv } = await supabase.from("conversations").select("id").eq("id", conversationId).maybeSingle();
    if (!conv) return jsonError("Conversation not found", 404);
  } else {
    const { data: conv, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, title: titleFrom(message) })
      .select("id")
      .single();
    if (error || !conv) return jsonError("Could not create the conversation", 500);
    conversationId = conv.id as string;
  }

  const { error: insertError } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, user_id: user.id, role: "user", content: message });
  if (insertError) return jsonError("Could not save the message", 500);

  // History (most recent messages, oldest first), merged so roles alternate
  const { data: rows } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const history: Anthropic.MessageParam[] = [];
  for (const r of (rows ?? []).reverse()) {
    const last = history[history.length - 1];
    if (last && last.role === r.role) last.content = `${last.content as string}\n\n${r.content}`;
    else history.push({ role: r.role as "user" | "assistant", content: r.content });
  }
  while (history.length && history[0].role !== "user") history.shift();

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY?.trim() });
  const encoder = new TextEncoder();
  const convId = conversationId;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullText = "";
      let inputTokens = 0;
      let cacheReadTokens = 0;
      let cacheWriteTokens = 0;
      let outputTokens = 0;
      let lastStopReason = "";
      let aborted = false;
      let current: { abort: () => void } | null = null;
      const onAbort = () => {
        aborted = true;
        current?.abort();
      };
      req.signal.addEventListener("abort", onAbort);

      try {
        const messages: Anthropic.MessageParam[] = [...history];
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          const ms = anthropic.messages.stream({
            model: MODEL,
            max_tokens: 3000,
            system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
            tools: round < MAX_TOOL_ROUNDS ? [SEARCH_TOOL] : [],
            messages,
          });
          current = ms;
          ms.on("text", (delta: string) => {
            fullText += delta;
            controller.enqueue(encoder.encode(delta));
          });
          const final: Anthropic.Message = await ms.finalMessage();
          inputTokens += final.usage.input_tokens ?? 0;
          cacheReadTokens += final.usage.cache_read_input_tokens ?? 0;
          cacheWriteTokens += final.usage.cache_creation_input_tokens ?? 0;
          outputTokens += final.usage.output_tokens ?? 0;
          lastStopReason = final.stop_reason ?? "";

          if (final.stop_reason === "max_tokens") {
            // One continuation call so Sami can finish the truncated answer
            const contMessages: Anthropic.MessageParam[] = [
              ...messages,
              { role: "assistant", content: fullText },
              { role: "user", content: "Continúa exactamente donde quedaste, sin repetir nada. Cierra la respuesta de forma natural." },
            ];
            const contMs = anthropic.messages.stream({
              model: MODEL,
              max_tokens: 3000,
              system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
              messages: contMessages,
            });
            current = contMs;
            contMs.on("text", (delta: string) => {
              fullText += delta;
              controller.enqueue(encoder.encode(delta));
            });
            const contFinal: Anthropic.Message = await contMs.finalMessage();
            inputTokens += contFinal.usage.input_tokens ?? 0;
            cacheReadTokens += contFinal.usage.cache_read_input_tokens ?? 0;
            cacheWriteTokens += contFinal.usage.cache_creation_input_tokens ?? 0;
            outputTokens += contFinal.usage.output_tokens ?? 0;
            lastStopReason = contFinal.stop_reason ?? "";
            break;
          }

          if (final.stop_reason !== "tool_use") break;

          const toolUses = final.content.filter((b: Anthropic.ContentBlock): b is Anthropic.ToolUseBlock => b.type === "tool_use");
          messages.push({ role: "assistant", content: final.content });
          const results = await Promise.all(
            toolUses.map(async (t: Anthropic.ToolUseBlock) => ({
              type: "tool_result" as const,
              tool_use_id: t.id,
              content: await searchLessons(supabase, (t.input as { query?: string })?.query ?? ""),
            })),
          );
          messages.push({ role: "user", content: results });
          if (fullText && !fullText.endsWith("\n")) {
            fullText += "\n\n";
            controller.enqueue(encoder.encode("\n\n"));
          }
        }
      } catch (err) {
        if (!aborted) {
          if (err instanceof Anthropic.APIError && err.status === 401) {
            console.error("[chat] Anthropic rejected the API key (401)");
          }
          console.error("[chat] Anthropic error", err);
          controller.enqueue(encoder.encode(ERROR_MARKER));
        }
      } finally {
        req.signal.removeEventListener("abort", onAbort);
        console.log("[sami usage]", { model: MODEL, input: inputTokens, cacheRead: cacheReadTokens, cacheWrite: cacheWriteTokens, output: outputTokens, stop_reason: lastStopReason });
        const content = fullText.trim();
        if (content) {
          await supabase.from("messages").insert({
            conversation_id: convId,
            user_id: user.id,
            role: "assistant",
            content,
            input_tokens: inputTokens + cacheReadTokens + cacheWriteTokens,
            output_tokens: outputTokens,
          });
        }
        await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
        try {
          controller.close();
        } catch {
          // stream already closed by the client
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Conversation-Id": convId,
    },
  });
}
