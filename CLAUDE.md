# Sami SPC Chat — notes for Claude Code

ChatGPT-style chat for Secure Parent Collective members (HIC Parenting). Next.js 15 App Router + TypeScript + Tailwind 3, Supabase Auth/DB via @supabase/ssr, Anthropic SDK (Claude), deployed on Vercel.

- Chat API: `src/app/api/chat/route.ts`. Streams plain text; new conversation id in the `X-Conversation-Id` header; mid-stream failures append `ERROR_MARKER` (`src/lib/sami/constants.ts`). Tool loop with `search_lessons` (max 3 rounds). System prompt is cached (`cache_control: ephemeral`).
- Sami's brain: `knowledge/*.md` → `npm run knowledge` regenerates `src/lib/sami/knowledge.ts` (never edit that file by hand). Transcripts → `npm run ingest` → table `kb_chunks`, searched by SQL function `search_kb` (English full-text search, lesson title weighted A).
- DB schema and RLS: `supabase/migrations/0001_sami_chat.sql`. Users only see their own `conversations`/`messages`. New SQL changes go in a new numbered migration file and must be run manually in the Supabase SQL Editor.
- Auth: middleware in `src/lib/supabase/middleware.ts`; public paths are `/login` and `/auth/*`. Any new public route must be added to `PUBLIC_PATHS`.
- UI strings live in `src/lib/i18n.ts` (EN/ES). Brand: navy #082653, orange #ff8d2c, Manrope.
- Env vars: see `.env.example`. `SUPABASE_SERVICE_ROLE_KEY` is only for the ingest script, never in Vercel.
- Before finishing a change: `npx tsc --noEmit` and `npm run build`.
