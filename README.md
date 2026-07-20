# FamilyBrain

Local-first MVP: connect Paperless-ngx, sync documents into SQLite, and extract structured household knowledge with AI.

## Features

- Paperless REST API connection (token auth, read-only)
- Local SQLite cache with WAL mode
- Document list + detail views
- AI summaries (category, dates, amounts, deadlines, warranties, finance, travel)
- Dashboards for warranties, deadlines, finance and travel
- Single-user login for every page and API route
- Installable online PWA for iOS, iPadOS and Android

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
# Add FAMILYBRAIN_USERNAME, FAMILYBRAIN_PASSWORD and a 32+ character
# FAMILYBRAIN_SESSION_SECRET to .env.local
# Add OPENAI_API_KEY to .env.local (optional; can be set in the UI)
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
npm run auth:secrets -- 'a secure password with 12+ characters'
```

## Docker (recommended: pre-built image)

FamilyBrain publishes a ready-to-run image to GitHub Container Registry (GHCR).
You do **not** need Node.js or a local build on the server — only Docker Compose.

Default host port is **3100** (container listens on 3000 internally).

### First install

```bash
mkdir familybrain && cd familybrain
curl -fsSLO https://raw.githubusercontent.com/rolfwalker71-commits/familybrain/main/docker-compose.yml
curl -fsSLO https://raw.githubusercontent.com/rolfwalker71-commits/familybrain/main/.env.example
cp .env.example .env
mkdir -p data
```

Generate login secrets (Docker one-liner, no local npm required):

```bash
docker run --rm node:22-bookworm-slim node -e "
const { randomBytes, scryptSync } = require('crypto');
const pw = process.argv[1];
const salt = randomBytes(24).toString('base64url');
const hash = scryptSync(pw, salt, 64).toString('base64url');
console.log('FAMILYBRAIN_PASSWORD_HASH=scrypt:' + salt + ':' + hash);
console.log('FAMILYBRAIN_SESSION_SECRET=' + randomBytes(48).toString('base64url'));
" 'your-secure-password-here'
```

Copy the two output lines into `.env`. Set `FAMILYBRAIN_USERNAME` if needed.
Optionally add `OPENAI_API_KEY` to `.env` (or configure later in the UI).

Start:

```bash
sudo chown -R 1000:1000 ./data
docker compose pull
docker compose up -d
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

### Updates (all hosts)

```bash
cd familybrain
docker compose pull
docker compose up -d
```

SQLite in `./data` is kept via the volume mount. No `git pull` or `--build` required
on production servers.

Pin a specific release instead of `latest`:

```bash
# in .env
FAMILYBRAIN_IMAGE_TAG=v0.2.0
docker compose pull && docker compose up -d
```

### Local build (developers only)

If you clone the repo and change code:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

### Deploy on a Linux host next to Paperless-ngx

FamilyBrain is a **separate** Compose stack. It does not join the Paperless network; it talks to Paperless over HTTP like a browser.

1. On the host, create a directory with `docker-compose.yml`, `.env`, and `./data/` (see **First install** above). You only need those files — not the full git repo.
2. Generate auth secrets and fill `.env` (see above).
3. Start:
   ```bash
   sudo chown -R 1000:1000 ./data
   docker compose pull
   docker compose up -d
   ```
4. Open `http://<host-ip>:3100` (firewall: allow TCP 3100 if you access from other devices).
5. In **Einstellungen**:
   - **Paperless base URL**: the URL you already use in the browser  
     (e.g. `https://paperless.example.com` or `http://host-ip:8000`).  
     Prefer the same URL that works from your LAN; Docker-internal names like `http://webserver:8000` only work if both stacks share a network (not required for this MVP).
   - Paste a Paperless **API token** (Paperless → Settings → API Tokens).
6. Test connection → Sync → analyze.

**Multiple locations:** repeat the same setup on each host. Each instance keeps its own `./data/` volume; only `.env` and compose files are shared.


### PWA installation

FamilyBrain is an online PWA and always needs a connection to the FamilyBrain
server. No document or API data is cached for offline use.

- **iPhone/iPad:** open the HTTPS URL in Safari → Share → **Add to Home Screen**
- **Android:** open the HTTPS URL in Chrome → menu → **Install app**

Use HTTPS on the reverse proxy. Login sessions are stored in a secure,
HTTP-only cookie and work in both the desktop browser and the installed PWA.
On some iOS versions the installed PWA asks for one additional login.

The reverse proxy should preserve `Host` and send `X-Forwarded-Host`,
`X-Forwarded-Proto` and `X-Forwarded-For`. FamilyBrain uses these headers for
same-origin protection and login throttling. Rotating
`FAMILYBRAIN_SESSION_SECRET` invalidates all existing sessions.

For PDF guide uploads (up to 50 MB), the app sends the file as a raw PDF body
(not multipart FormData), which is more reliable behind reverse proxies.

With Nginx Proxy Manager the default `client_max_body_size` is already large
(2000m). If large uploads still time out, add this in the Proxy Host →
**Advanced** tab:

```nginx
proxy_request_buffering off;
proxy_read_timeout 300s;
proxy_send_timeout 300s;
```

**Existing data:** copy `data/familybrain.sqlite` (and stop the app first if WAL files exist) into `./data/` on the host before `up`, or start empty and re-sync from Paperless.

**Troubleshooting**

```bash
docker compose logs -f familybrain
```

- Browser shows „This page couldn't load“ / server error: usually the app can't write `./data` (permissions) or the DB init failed. Fix ownership, then restart:
  `sudo chown -R 1000:1000 data && docker compose restart`
- Confirm the container is healthy: `curl -sI http://127.0.0.1:3100/login`
- Image pull fails on a private fork: run `docker login ghcr.io` with a GitHub PAT that has `read:packages`.

## Publishing (maintainers)

Images are built automatically by GitHub Actions on every push to `main` and on version tags `v*`.

- Image: `ghcr.io/rolfwalker71-commits/familybrain:latest`
- Tagged releases: `ghcr.io/rolfwalker71-commits/familybrain:v1.2.3`

After the first successful workflow run, open the package on GitHub → **Package settings** → set visibility to **Public** so others can pull without login.

Release a version:

```bash
git tag v0.2.0
git push origin v0.2.0
```


## Notes

- Paperless remains source of truth
- No write-back to Paperless in this MVP
- PDFs are not downloaded; OCR `content` from the API is used
- SQLite file: `data/familybrain.sqlite` (gitignored)
- One FamilyBrain instance is enough for a home Paperless host
- Default Docker host port: **3100** (avoids conflicts with other apps on 3000)
- Travel/finance/deadline labels are normalized semantically on read and on new analyses (e.g. Cruise→Kreuzfahrt); finance overview uses display buckets
- App version (`YYYYMMDD-HHMM`) is shown at the bottom of the sidebar; enable auto-bump on commit once with `npm run hooks:install`
