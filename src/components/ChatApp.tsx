"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLang, type Strings } from "@/lib/i18n";
import { ERROR_MARKER } from "@/lib/sami/constants";
import LangToggle from "./LangToggle";
import Markdown from "./Markdown";

type Conversation = { id: string; title: string; updated_at: string };
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  error?: string;
};

const uid = () => Math.random().toString(36).slice(2);

export default function ChatApp({ initialConversationId, userEmail }: { initialConversationId: string | null; userEmail: string }) {
  const router = useRouter();
  const { lang, setLang, t } = useLang();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(initialConversationId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(!!initialConversationId);
  const [streaming, setStreaming] = useState(false);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);

  // ---------- data ----------
  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/conversations", { cache: "no-store" });
    if (res.status === 401) return router.replace("/login");
    if (res.ok) {
      const data = await res.json();
      setConversations(data.conversations);
    }
    setListLoaded(true);
  }, [router]);

  const loadMessages = useCallback(
    async (id: string) => {
      setLoadingMessages(true);
      const res = await fetch(`/api/conversations/${id}`, { cache: "no-store" });
      if (res.status === 404) {
        setActiveId(null);
        setMessages([]);
        window.history.replaceState(null, "", "/");
      } else if (res.ok) {
        const data = await res.json();
        setMessages(
          (data.messages as { id: string; role: "user" | "assistant"; content: string }[]).map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
          })),
        );
      }
      setLoadingMessages(false);
      stickToBottom.current = true;
    },
    [],
  );

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (initialConversationId) loadMessages(initialConversationId);
  }, [initialConversationId, loadMessages]);

  // Browser back/forward between chats
  useEffect(() => {
    const onPop = () => {
      const m = window.location.pathname.match(/^\/c\/([0-9a-f-]+)$/i);
      const id = m ? m[1] : null;
      abortRef.current?.abort();
      setActiveId(id);
      if (id) loadMessages(id);
      else setMessages([]);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [loadMessages]);

  // ---------- scrolling ----------
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  }

  // ---------- actions ----------
  function openConversation(id: string) {
    if (id === activeId) return setSidebarOpen(false);
    abortRef.current?.abort();
    setActiveId(id);
    setMessages([]);
    setSidebarOpen(false);
    window.history.pushState(null, "", `/c/${id}`);
    loadMessages(id);
  }

  function newChat() {
    abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setInput("");
    setSidebarOpen(false);
    window.history.pushState(null, "", "/");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function renameConversation(id: string, title: string) {
    setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, title } : c)));
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  }

  async function deleteConversation(id: string) {
    setConversations((cs) => cs.filter((c) => c.id !== id));
    if (id === activeId) newChat();
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  function errorText(code: string | undefined, status: number) {
    if (code === "daily_limit" || status === 429) return t.errLimit;
    if (code === "not_member") return t.errMember;
    return t.errGeneric;
  }

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || streaming) return;

    const assistantId = uid();
    setMessages((m) => [
      ...m.filter((x) => !x.error),
      { id: uid(), role: "user", content: text },
      { id: assistantId, role: "assistant", content: "", pending: true },
    ]);
    setInput("");
    setStreaming(true);
    stickToBottom.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    const updateAssistant = (patch: Partial<ChatMessage>) =>
      setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, ...patch } : x)));

    let convId = activeId;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, message: text }),
        signal: controller.signal,
      });

      if (res.status === 401) return router.replace("/login");
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        updateAssistant({ pending: false, error: errorText(data.error, res.status) });
        return;
      }

      const newId = res.headers.get("X-Conversation-Id");
      if (newId && newId !== activeId) {
        convId = newId;
        setActiveId(newId);
        window.history.replaceState(null, "", `/c/${newId}`);
        const title = text.replace(/\s+/g, " ").slice(0, 60);
        setConversations((cs) => [{ id: newId, title, updated_at: new Date().toISOString() }, ...cs]);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        if (acc.includes(ERROR_MARKER)) {
          const clean = acc.split(ERROR_MARKER).join("");
          updateAssistant({ content: clean, pending: false, error: t.errGeneric });
          return;
        }
        updateAssistant({ content: acc, pending: true });
      }
      updateAssistant({ content: acc, pending: false, error: acc.trim() ? undefined : t.errGeneric });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, pending: false } : x)).filter((x) => x.content || x.role === "user"));
      } else {
        updateAssistant({ pending: false, error: t.errGeneric });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      if (convId) {
        setConversations((cs) => {
          const c = cs.find((x) => x.id === convId);
          return c ? [{ ...c, updated_at: new Date().toISOString() }, ...cs.filter((x) => x.id !== convId)] : cs;
        });
      }
    }
  }

  function retry(msg: ChatMessage) {
    const idx = messages.findIndex((m) => m.id === msg.id);
    const lastUser = [...messages.slice(0, idx)].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    setMessages((m) => m.filter((x) => x.id !== msg.id && x.id !== lastUser.id));
    send(lastUser.content);
  }

  const activeTitle = conversations.find((c) => c.id === activeId)?.title;

  return (
    <div className="flex h-full overflow-hidden bg-cream">
      {/* Sidebar */}
      {sidebarOpen && (
        <button aria-label="Close menu" className="fixed inset-0 z-30 bg-navy-900/50 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <Sidebar
        t={t}
        lang={lang}
        setLang={setLang}
        open={sidebarOpen}
        conversations={conversations}
        loaded={listLoaded}
        activeId={activeId}
        userEmail={userEmail}
        onNew={newChat}
        onOpen={openConversation}
        onRename={renameConversation}
        onDelete={deleteConversation}
        onSignOut={signOut}
      />

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line/70 bg-white/70 px-4 backdrop-blur">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-navy hover:bg-sky md:hidden"
            aria-label={t.menu}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-bold text-navy">{activeTitle ?? "Sami · Your SPC Guide"}</h1>
          <button
            type="button"
            onClick={newChat}
            className="rounded-lg p-2 text-navy hover:bg-sky md:hidden"
            aria-label={t.newChat}
          >
            <PlusIcon />
          </button>
        </header>

        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
          {loadingMessages ? (
            <div className="grid h-full place-items-center text-sm text-muted">{t.loading}</div>
          ) : messages.length === 0 ? (
            <EmptyState t={t} onPick={send} />
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
              {messages.map((m) => (
                <MessageRow key={m.id} m={m} t={t} onRetry={() => retry(m)} />
              ))}
            </div>
          )}
        </div>

        <Composer
          t={t}
          inputRef={inputRef}
          value={input}
          onChange={setInput}
          onSend={() => send(input)}
          onStop={() => abortRef.current?.abort()}
          streaming={streaming}
        />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function Avatar({ size = 36 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-[#ffd8a8] bg-[#fff4e6]"
      style={{ width: size, height: size }}
    >
      <img src="/sami/sami-avatar.png" alt="" style={{ width: size, height: size }} className="object-cover object-top" />
    </span>
  );
}

function groupConversations(cs: Conversation[], t: Strings) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekAgo = startToday - 6 * 86400000;
  const groups: { label: string; items: Conversation[] }[] = [
    { label: t.today, items: [] },
    { label: t.week, items: [] },
    { label: t.older, items: [] },
  ];
  for (const c of cs) {
    const ts = new Date(c.updated_at).getTime();
    groups[ts >= startToday ? 0 : ts >= weekAgo ? 1 : 2].items.push(c);
  }
  return groups.filter((g) => g.items.length);
}

function Sidebar(props: {
  t: Strings;
  lang: "en" | "es";
  setLang: (l: "en" | "es") => void;
  open: boolean;
  conversations: Conversation[];
  loaded: boolean;
  activeId: string | null;
  userEmail: string;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onSignOut: () => void;
}) {
  const { t, open, conversations, activeId } = props;
  const groups = useMemo(() => groupConversations(conversations, t), [conversations, t]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-navy-900 text-white transition-transform md:static md:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <Avatar size={40} />
        <div>
          <p className="text-[15px] font-extrabold text-white">Sami</p>
          <p className="text-xs text-white/60">{t.samiGuide}</p>
        </div>
      </div>
      <div className="px-3">
        <button
          type="button"
          onClick={props.onNew}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-light to-[#ff831e] px-4 py-2.5 text-sm font-extrabold text-navy shadow-[0_5px_0_#00000033] transition hover:-translate-y-0.5"
        >
          <PlusIcon /> {t.newChat}
        </button>
      </div>

      <nav className="mt-4 flex-1 overflow-y-auto px-2 pb-4">
        {props.loaded && conversations.length === 0 && <p className="px-3 py-2 text-sm text-white/60">{t.noChats}</p>}
        {groups.map((g) => (
          <div key={g.label} className="mb-4">
            <p className="px-3 pb-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#9cc4ef]">{g.label}</p>
            <ul className="flex flex-col gap-0.5">
              {g.items.map((c) => (
                <li key={c.id}>
                  {editing === c.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const v = draft.trim();
                        if (v) props.onRename(c.id, v);
                        setEditing(null);
                      }}
                      className="px-1"
                    >
                      <input
                        autoFocus
                        aria-label={t.rename}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => setEditing(null)}
                        onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                        className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-brand"
                      />
                    </form>
                  ) : confirming === c.id ? (
                    <div className="rounded-lg bg-white/10 px-3 py-2 text-sm">
                      <p className="mb-2 text-white/90">{t.confirmDelete}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="rounded-md bg-red-500 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-600"
                          onClick={() => {
                            setConfirming(null);
                            props.onDelete(c.id);
                          }}
                        >
                          {t.yes}
                        </button>
                        <button type="button" className="rounded-md px-2.5 py-1 text-xs font-bold text-white/80 hover:bg-white/10" onClick={() => setConfirming(null)}>
                          {t.cancel}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`group flex items-center rounded-lg ${c.id === activeId ? "bg-white/15" : "hover:bg-white/10"}`}
                    >
                      <button
                        type="button"
                        onClick={() => props.onOpen(c.id)}
                        className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm text-white/90"
                        title={c.title}
                      >
                        {c.title}
                      </button>
                      <div className="flex shrink-0 gap-0.5 pr-1 opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                        <button
                          type="button"
                          aria-label={t.rename}
                          title={t.rename}
                          className="rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
                          onClick={() => {
                            setDraft(c.title);
                            setEditing(c.id);
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path d="M4 20h4L19 9l-4-4L4 16v4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          aria-label={t.delete}
                          title={t.delete}
                          className="rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
                          onClick={() => setConfirming(c.id)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-4 py-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <LangToggle lang={props.lang} onChange={props.setLang} dark />
          <button type="button" onClick={props.onSignOut} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-white/80 hover:bg-white/10 hover:text-white">
            {t.signOut}
          </button>
        </div>
        <p className="truncate text-xs text-white/50" title={props.userEmail}>
          {props.userEmail}
        </p>
        <div className="mt-3 flex items-center gap-1.5 opacity-70">
          <span className="text-[10px] text-white/50">by</span>
          <img src="/logo-white.png" alt="HIC Parenting" className="h-6 w-auto" />
        </div>
      </div>
    </aside>
  );
}

function SnowflakeSVG({ className }: { className?: string }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

function EmptyState({ t, onPick }: { t: Strings; onPick: (s: string) => void }) {
  return (
    <div className="relative mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center px-4 py-10 text-center sm:px-6" style={{ background: "linear-gradient(to bottom, #fffaf3, #ffffff)" }}>
      {/* Decorative snowflakes */}
      <SnowflakeSVG className="pointer-events-none absolute left-6 top-8 text-navy/[0.15]" />
      <SnowflakeSVG className="pointer-events-none absolute right-10 top-16 text-brand/[0.15]" />
      <SnowflakeSVG className="pointer-events-none absolute bottom-20 left-12 text-navy-700/[0.12]" />

      {/* Floating Sami */}
      <div className="flex flex-col items-center">
        <img
          src="/sami/sami-full.png"
          alt="Sami, la pingüina de HIC"
          className="sami-float h-[170px] w-auto"
        />
        {/* Elliptical shadow */}
        <div className="mt-2 h-3 w-20 rounded-full bg-navy/10 blur-sm" />
      </div>

      {/* Speech bubble */}
      <div className="relative mt-6 rounded-2xl border border-line bg-white px-6 py-4 shadow-sm">
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 rotate-45 border-l border-t border-line bg-white" style={{ width: 14, height: 14 }} />
        <h2 className="relative text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">
          {t.greetingTitle} <span className="text-brand-dark">🐧</span>
        </h2>
        <p className="relative mt-3 max-w-xl text-[15px] leading-relaxed text-muted">{t.greeting}</p>
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-navy-700">
        <span className="rounded-full border border-line bg-white px-3 py-1">Emotional regulation</span>
        <span className="rounded-full border border-line bg-white px-3 py-1">Mindsight</span>
        <span className="rounded-full border border-line bg-white px-3 py-1">Positive discipline</span>
      </div>
      <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
        {t.starters.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className={`rounded-2xl border p-4 text-left text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-lg ${
              i === 0 ? "border-navy-700 bg-navy-700 text-white" : "border-line bg-white text-ink hover:border-brand"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageRow({ m, t, onRetry }: { m: ChatMessage; t: Strings; onRetry: () => void }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-navy px-4 py-3 text-[15px] leading-relaxed text-white">
          {m.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      {m.pending && !m.content ? (
        <span className="sami-wobble shrink-0"><Avatar /></span>
      ) : (
        <Avatar />
      )}
      <div className="min-w-0 flex-1 pt-1.5">
        {m.content ? <Markdown text={m.content} /> : null}
        {m.pending && !m.content && (
          <span className="inline-flex items-center gap-1.5 py-2 text-sm text-muted">
            {t.samiThinking}<span className="thinking-dots" />
          </span>
        )}
        {m.error && (
          <div className="mt-2 rounded-xl border border-[#ffd7a6] bg-brand-soft px-4 py-3 text-sm text-navy">
            <p>{m.error}</p>
            {m.error === t.errGeneric && (
              <button type="button" onClick={onRetry} className="mt-2 rounded-lg bg-navy px-3 py-1.5 text-xs font-bold text-white">
                {t.retry}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Composer(props: {
  t: Strings;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
}) {
  const { t, inputRef, value } = props;

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value, inputRef]);

  return (
    <div className="shrink-0 bg-gradient-to-t from-cream via-cream to-transparent px-3 pb-4 pt-2 sm:px-6">
      <form
        className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-line bg-white p-2 shadow-[0_10px_30px_#0b40711a] focus-within:border-navy-700"
        onSubmit={(e) => {
          e.preventDefault();
          props.onSend();
        }}
      >
        <label htmlFor="composer" className="sr-only">
          {t.placeholder}
        </label>
        <textarea
          id="composer"
          ref={inputRef}
          rows={1}
          maxLength={4000}
          value={value}
          placeholder={t.placeholder}
          onChange={(e) => props.onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              props.onSend();
            }
          }}
          className="max-h-[200px] min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] leading-6 text-ink outline-none placeholder:text-muted/70"
        />
        {props.streaming ? (
          <button
            type="button"
            onClick={props.onStop}
            className="flex h-11 items-center gap-2 rounded-xl bg-navy px-4 text-sm font-bold text-white"
          >
            <span className="h-3 w-3 rounded-sm bg-white" aria-hidden /> {t.stop}
          </button>
        ) : (
          <button
            type="submit"
            disabled={!value.trim()}
            className="flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-brand-light to-[#ff831e] px-4 text-sm font-extrabold text-navy transition disabled:opacity-40"
          >
            {t.send}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </form>
      <p className="mx-auto mt-2 max-w-3xl text-center text-[11.5px] text-muted">{t.disclaimer}</p>
    </div>
  );
}
