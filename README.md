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

## Notes

- Paperless remains source of truth
- No write-back to Paperless in this MVP
- PDFs are not downloaded; OCR `content` from the API is used
- SQLite file: `data/familybrain.sqlite` (gitignored)
