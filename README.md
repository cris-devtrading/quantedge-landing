# QuantEdge Solutions — Landing Page

Landing page institucional con AI chat (Claude API) integrado via Vercel Serverless Functions.

## Stack
- `index.html` — Frontend estático (HTML/CSS/JS puro)
- `api/chat.js` — Serverless function Node.js (proxy seguro a Anthropic API)
- `vercel.json` — Config de routing Vercel

## Deploy en Vercel

### 1. Subir a GitHub
- Abrí GitHub Desktop
- Creá un repo nuevo: `quantedge-landing`
- Arrastrá esta carpeta al repo
- Commit: "Initial deploy — QuantEdge landing v3"
- Push to origin

### 2. Conectar a Vercel
- Entrá a https://vercel.com
- "Add New Project" → importá el repo `quantedge-landing`
- Framework: **Other** (no Next.js, no nada)
- Dejá todo por default → Deploy

### 3. Agregar la API Key de Anthropic
En Vercel dashboard del proyecto:
- Settings → Environment Variables
- Agregar:
  - **Name:** `ANTHROPIC_API_KEY`
  - **Value:** `sk-ant-xxxxxxxxxx` (tu key real)
  - Environment: Production + Preview + Development
- Save → Redeploy

### 4. Listo
El chat de IA va a funcionar en producción.
La key NUNCA queda expuesta en el browser — solo vive en el servidor de Vercel.

## URL sugerida
Podés configurar en Vercel Settings → Domains:
`quantedge.vercel.app` o tu dominio propio

## Contacto demo
quantedgelatam@gmail.com
