# Sami · SPC Chat (HIC Parenting)

Chat tipo ChatGPT para los miembros del Secure Parent Collective. Sami responde con **Claude (Anthropic)**, usa las instrucciones y los archivos de conocimiento del SPC y busca dentro de las transcripciones de las 88 lecciones. Cada miembro inicia sesión con su email y tiene su propio historial de conversaciones.

**Stack:** Next.js 15 (App Router) + TypeScript + Tailwind · Supabase (login y base de datos) · Anthropic API · deploy en Vercel. No necesita Railway.

---

## Cómo funciona

- **Login:** email y contraseña con Supabase Auth, más "olvidé mi contraseña". Todas las páginas y la API exigen sesión.
- **Chat:** las respuestas llegan en streaming, como en ChatGPT. Hay botón para detener, historial en la barra lateral (renombrar y eliminar), la interfaz en inglés y español y diseño para móvil.
- **Conocimiento de Sami:**
  - `knowledge/00_Sami_Instructions.txt` y los archivos 01–04 van fijos en el prompt del sistema. Anthropic los guarda en caché, así que salen más baratos desde el segundo mensaje.
  - Las transcripciones `knowledge/transcripts/T01–T12` se cargan en Supabase (`npm run ingest`). Claude las consulta con una herramienta de búsqueda interna cuando la respuesta lo necesita.
- **Control de costos:**
  - Límite de mensajes por miembro cada 24 horas (`DAILY_MESSAGE_LIMIT`, 60 por defecto).
  - Se usan las últimas 24 líneas de la conversación como contexto.
  - Cada respuesta guarda los tokens usados en la tabla `messages`.
- **Acceso solo para miembros (opcional):** con `REQUIRE_MEMBERSHIP=true`, solo pueden chatear los emails que estén en la tabla `allowed_members`.

---

## Puesta en marcha

### 1. Supabase
1. Crea un proyecto nuevo en supabase.com.
2. Ve a **SQL Editor**, pega todo el contenido de `supabase/migrations/0001_sami_chat.sql` y dale **Run**.
3. En **Authentication → URL Configuration**:
   - **Site URL:** la URL final de la app (por ejemplo `https://sami.hicparenting.com`, o la de Vercel).
   - **Redirect URLs:** agrega `https://TU-DOMINIO/auth/callback` y `http://localhost:3000/auth/callback`.
4. En **Authentication → Providers → Email** deja Email activo. "Confirm email" puede quedar activo: el miembro confirma su cuenta desde el correo.
5. Copia de **Project Settings → API**: `Project URL`, `anon public key` y `service_role key`.

### 2. Anthropic
1. En console.anthropic.com crea una API key (Settings → API Keys).
2. Pon un límite de gasto mensual en **Settings → Limits**.

### 3. Correr en tu computador (opcional, para probar)
```bash
cp .env.example .env.local      # y llena los valores
npm install
npm run ingest                  # carga las transcripciones en Supabase (una vez)
npm run dev                     # abre http://localhost:3000
```

### 4. Cargar las transcripciones (obligatorio, una vez)
Hace falta `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`. Ejecuta `npm run ingest`. Deben quedar unos 1.778 fragmentos de 88 lecciones. Vuelve a correrlo cada vez que agregues o cambies una transcripción: reemplaza todo.

### 5. Vercel
1. Sube el proyecto a un repositorio **privado** de GitHub (las transcripciones tienen datos de miembros).
2. En vercel.com → **Add New → Project** → importa el repositorio.
3. En **Environment Variables** agrega:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `ANTHROPIC_API_KEY`
   - `ANTHROPIC_MODEL` = `claude-sonnet-5-5` (o `claude-haiku-5-5`, más barato y rápido)
   - `NEXT_PUBLIC_SITE_URL` = la URL final de la app
   - `DAILY_MESSAGE_LIMIT` = `60`
   - `REQUIRE_MEMBERSHIP` = `false` (o `true`, ver abajo)

   **No** agregues `SUPABASE_SERVICE_ROLE_KEY` en Vercel: solo se usa en tu computador para `npm run ingest`.
4. Dale **Deploy**.
5. Si usas un dominio propio (por ejemplo `sami.hicparenting.com`), agrégalo en Vercel → Settings → Domains. Después actualiza la Site URL y las Redirect URLs en Supabase.

---

## Dar acceso solo a miembros del SPC
1. Pon `REQUIRE_MEMBERSHIP=true` en Vercel y vuelve a desplegar.
2. Carga los emails en la tabla `allowed_members` (Supabase → Table Editor → `allowed_members` → Insert, o importa un CSV con la columna `email`).

Quien no esté en la lista puede crear cuenta, pero al escribir verá un aviso para usar el email de su membresía o contactar al equipo.

## Actualizar a Sami
- **Instrucciones o archivos 01–04:** edita los archivos en `knowledge/`, corre `npm run knowledge`, haz commit y push. Vercel vuelve a desplegar solo.
- **Transcripciones nuevas:** agrega el archivo `T13_...md` en `knowledge/transcripts/` con el mismo formato (`## LESSON: ...`, `Module:`, `Where to watch:`). Después corre `npm run ingest`.
- **Modelo:** cambia `ANTHROPIC_MODEL` en Vercel.

## Estructura
```
knowledge/                     instrucciones, archivos 01–04 y transcripciones
supabase/migrations/           tablas, seguridad (RLS) y búsqueda
scripts/ingest-knowledge.ts    carga las transcripciones en Supabase
scripts/build-knowledge.mjs    regenera src/lib/sami/knowledge.ts
src/app/api/chat/route.ts      llamada a Claude con streaming y búsqueda en lecciones
src/app/api/conversations/     historial: listar, abrir, renombrar, eliminar
src/app/login/                 login, registro y recuperar contraseña
src/components/ChatApp.tsx     interfaz del chat
src/lib/sami/prompt.ts         prompt del sistema de Sami
```

## Seguridad
- Cada miembro solo puede ver sus propias conversaciones (Row Level Security en Supabase).
- Las transcripciones no se pueden leer directamente: solo se consultan con la función `search_kb`, y únicamente con sesión iniciada.
- La API key de Anthropic solo existe en el servidor (Vercel), nunca en el navegador.
