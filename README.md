# FamilyBrain

Local-first MVP: connect Paperless-ngx, sync documents into SQLite, and extract structured household knowledge with AI.

## Features

- Paperless REST API connection (token auth, read-only)
- Local SQLite cache with WAL mode
- Document list + detail views
- AI summaries (category, dates, amounts, deadlines, warranties, finance, travel)
- Dashboards for warranties, deadlines, finance and travel

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS + shadcn/ui
- better-sqlite3
- Zod
- OpenAI

## Setup

```bash
npm install
cp .env.local.example .env.local
# Add OPENAI_API_KEY to .env.local
npm run db:init
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

1. Go to **Einstellungen** / **Paperless Sync**
2. Enter Paperless base URL and API token
3. Test connection, then sync
4. Analyze documents (single or batch)

## Scripts

```bash
npm run db:init
npm run sync:paperless
npm run analyze:pending
npm run analyze:pending -- 25
```

## Docker (same machine as Paperless)

Single-instance deploy with persistent SQLite:

```bash
cp .env.example .env
# Optional: set OPENAI_API_KEY in .env (or later in UI)
docker compose up -d --build
```

Open [http://localhost:3000](http://localhost:3000) (or `FAMILYBRAIN_PORT`).

1. **Einstellungen**: Paperless base URL (your usual external URL is fine) + API token  
2. Test connection → Sync  
3. Start analysis  

Data lives in `./data` on the host (`DATABASE_PATH=/app/data/familybrain.sqlite` in the container).

```bash
docker compose logs -f familybrain
docker compose down
```

## Notes

- Paperless remains source of truth
- No write-back to Paperless in this MVP
- PDFs are not downloaded; OCR `content` from the API is used
- SQLite file: `data/familybrain.sqlite` (gitignored)
- One FamilyBrain instance is enough for a home Paperless host
