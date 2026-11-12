-- Sami SPC Chat: conversations, messages, knowledge search and member access.
-- Run once in Supabase > SQL Editor (or with `supabase db push`).

create extension if not exists pgcrypto;

-- ---------- Conversations ----------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_user_updated_idx on public.conversations (user_id, updated_at desc);

alter table public.conversations enable row level security;

drop policy if exists "own conversations select" on public.conversations;
create policy "own conversations select" on public.conversations for select using (auth.uid() = user_id);
drop policy if exists "own conversations insert" on public.conversations;
create policy "own conversations insert" on public.conversations for insert with check (auth.uid() = user_id);
drop policy if exists "own conversations update" on public.conversations;
create policy "own conversations update" on public.conversations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own conversations delete" on public.conversations;
create policy "own conversations delete" on public.conversations for delete using (auth.uid() = user_id);

-- ---------- Messages ----------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);
create index if not exists messages_user_created_idx on public.messages (user_id, created_at);

alter table public.messages enable row level security;

drop policy if exists "own messages select" on public.messages;
create policy "own messages select" on public.messages for select using (auth.uid() = user_id);
drop policy if exists "own messages insert" on public.messages;
create policy "own messages insert" on public.messages for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid())
);
drop policy if exists "own messages delete" on public.messages;
create policy "own messages delete" on public.messages for delete using (auth.uid() = user_id);

-- ---------- Knowledge base (lesson transcripts) ----------
-- Filled by `npm run ingest`. Not readable directly by users; searched through search_kb().
create table if not exists public.kb_chunks (
  id bigint generated always as identity primary key,
  source text not null,          -- file name, e.g. T09_...
  lesson text not null,
  module text,
  url text,
  chunk_index integer not null,
  content text not null,
  fts tsvector generated always as (
    setweight(to_tsvector('english', coalesce(lesson, '')), 'A') || setweight(to_tsvector('english', content), 'B')
  ) stored
);
create index if not exists kb_chunks_fts_idx on public.kb_chunks using gin (fts);

alter table public.kb_chunks enable row level security;
-- no policies: only the service role and search_kb() can read it

create or replace function public.search_kb(query text, match_count integer default 6)
returns table (lesson text, module text, url text, content text, rank real)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select websearch_to_tsquery('english', query) as strict_q,
           to_tsquery('english', array_to_string(
             array(select quote_literal(lexeme) || ':*' from unnest(to_tsvector('english', query)) as t), ' | ')) as loose_q
  )
  select k.lesson, k.module, k.url, k.content,
         greatest(ts_rank(k.fts, q.strict_q) * 2, ts_rank(k.fts, q.loose_q)) as rank
  from public.kb_chunks k, q
  where auth.uid() is not null
    and (k.fts @@ q.strict_q or (q.loose_q is not null and k.fts @@ q.loose_q))
  order by rank desc
  limit least(greatest(match_count, 1), 10);
$$;

revoke all on function public.search_kb(text, integer) from public, anon;
grant execute on function public.search_kb(text, integer) to authenticated;

-- ---------- Member access (optional, used when REQUIRE_MEMBERSHIP=true) ----------
create table if not exists public.allowed_members (
  email text primary key,
  note text,
  created_at timestamptz not null default now()
);
alter table public.allowed_members enable row level security;
-- no policies: managed from the Supabase dashboard; checked through is_member()

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_members m
    where lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;
