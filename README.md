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

Single-instance deploy with persistent SQLite. Default host port is **3100** (container still listens on 3000 internally), so it does not clash with apps already on 3000.

```bash
cp .env.example .env
# Optional: set OPENAI_API_KEY in .env (or later in UI)
docker compose up -d --build
```

Open [http://localhost:3100](http://localhost:3100) (override with `FAMILYBRAIN_PORT` in `.env`).

1. **Einstellungen**: Paperless base URL + API token  
2. Test connection → Sync  
3. Start analysis  

Data lives in `./data` on the host (`DATABASE_PATH=/app/data/familybrain.sqlite` in the container).

```bash
docker compose logs -f familybrain
docker compose down
```

### Deploy on a Linux host next to Paperless-ngx

FamilyBrain is a **separate** Compose stack. It does not join the Paperless network; it talks to Paperless over HTTP like a browser.

1. On the host, clone/copy the repo (or only `Dockerfile`, `docker-compose.yml`, `.env.example`):
   ```bash
   git clone <your-repo-url> familybrain
   cd familybrain
   cp .env.example .env
   ```
2. Optionally put `OPENAI_API_KEY` in `.env` (or set it later in the UI).
3. Start:
   ```bash
   docker compose up -d --build
   ```
4. Open `http://<host-ip>:3100` (firewall: allow TCP 3100 if you access from other devices).
5. In **Einstellungen**:
   - **Paperless base URL**: the URL you already use in the browser  
     (e.g. `https://paperless.example.com` or `http://host-ip:8000`).  
     Prefer the same URL that works from your LAN; Docker-internal names like `http://webserver:8000` only work if both stacks share a network (not required for this MVP).
   - Paste a Paperless **API token** (Paperless → Settings → API Tokens).
6. Test connection → Sync → analyze.

**Existing data:** copy `data/familybrain.sqlite` (and stop the app first if WAL files exist) into `./data/` on the host before `up`, or start empty and re-sync from Paperless.

**Updates:**
```bash
cd familybrain
git pull
docker compose up -d --build
```

SQLite in `./data` is kept via the volume mount.

**Troubleshooting**

```bash
docker compose logs -f familybrain
```

- Browser shows „This page couldn't load“ / server error: usually the app can't write `./data` (permissions) or the DB init failed. After pulling the latest image (entrypoint fixes ownership), rebuild and restart.
- Still stuck: `sudo chown -R 1000:1000 data` then `docker compose restart`.
- Confirm the container is healthy: `curl -sI http://127.0.0.1:3100/dashboard`

## Notes

- Paperless remains source of truth
- No write-back to Paperless in this MVP
- PDFs are not downloaded; OCR `content` from the API is used
- SQLite file: `data/familybrain.sqlite` (gitignored)
- One FamilyBrain instance is enough for a home Paperless host
- Default Docker host port: **3100** (avoids conflicts with other apps on 3000)
- Travel/finance/deadline labels are normalized semantically on read and on new analyses (e.g. Cruise→Kreuzfahrt); finance overview uses display buckets
- App version (`YYYYMMDD-HHMM`) is shown at the bottom of the sidebar; enable auto-bump on commit once with `npm run hooks:install`
