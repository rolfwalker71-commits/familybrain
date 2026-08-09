# M365Desk — Bootstrap-Prompt für neuen Cursor-Workspace

> **Zweck:** Dieses Dokument 1:1 in den Chat eines **neuen, leeren** Cursor-Workspaces kopieren.
> Der Agent soll daraus eine eigenständige Docker-App aufsetzen (M365 + Kalender + Mail + AI + Tasks).
>
> **Stand:** 2026-08-09 · abgeleitet aus Buddy (`/microsoft`, `lib/microsoft/*`), ohne Maringo/Google/Paperless/Bild-KI.
>
> **Vor dem Start optional anpassen:** Produktname, `APP_PUBLIC_URL`, Host-Port.

---

# Aufgabe: Standalone Microsoft 365 Desk App (Docker) von Grund auf aufsetzen

Du bist ein Senior Full-Stack Agent. Baue in DIESEM leeren Workspace eine **eigenständige, Docker-basierte Web-App** für Kollegen: Microsoft 365 (Outlook Mail, Kalender, To Do, optional Planner) + AI-Unterstützung.

Das ist **kein Clone von Buddy/FamilyBrain**. Orientier dich an den Spezifikationen unten (Architektur, APIs, OAuth, Features), aber starte ein **sauberes neues Projekt** mit klarer Namensgebung. Keine Legacy-Module aus Buddy (Paperless, Google, Maringo/MARI, Finance, Trips, Travel, Hockey, Trilium, Qdrant/Embeddings, Web-Push, AI-Bilder/DALL·E).

Arbeite möglichst selbständig: Scaffold → Implementierung → Docker → `.env.example` → README (Setup Entra + Docker) → Sanity-Checks. Lies vor Next.js-Code die lokalen Next.js-Docs unter `node_modules/next/dist/docs/` (Next 16 hat Breaking Changes).

---

## 0. Produktziel

**Name (Platzhalter):** `M365Desk` (falls der User keinen anderen Namen nennt).

**Zielgruppe:** Kollegen im Büro (Schweiz). Jeder User hat eigenes Login in der App und verbindet **sein** Microsoft-365-Geschäftskonto (delegated OAuth).

**Nicht-Ziele (explizit ausschließen):**

- Maringo / MARI / Support-Tickets
- AI-Bildgenerierung / Vision / DALL·E / Bild-Uploads zur Bildanalyse
- Google Workspace / Gmail / Google Calendar / Google Tasks
- Paperless-ngx, DMS, PDF-Archiv-Pipeline
- Finanz-/Reise-/Familien-Features
- Teams-Chat schreiben, OneDrive als DMS, SharePoint-CMS
- Voller Outlook-Ersatz (kein kompletter Mail-Client mit Ordnerbaum wie Outlook)
- Qdrant / Embeddings / RAG (nicht nötig für v1)

**Leitbild:** Assistenz-Hub über Microsoft Graph: Tagesübersicht, Mail lesen/triagieren, Kalender-Review, Aufgaben, AI schlägt To-dos/Termine/Antwortentwürfe vor → User bestätigt → Write zurück nach Outlook.

UI-Sprache: **Deutsch** (Schweiz: Zeitzone `Europe/Zurich`, Datumsformat UI `DD.MM.YYYY`, AI intern oft `YYYY-MM-DD`). Schweizer Hochdeutsch in AI-Texten (kein ß → ss; «Grüsse»).

---

## 1. Tech-Stack (verbindlich)

| Bereich | Wahl |
|--------|------|
| Framework | **Next.js 16.x** (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS 4 + shadcn/ui (Base UI ok) + lucide-react |
| DB | **SQLite** via `better-sqlite3`, Datei unter `./data/*.sqlite` |
| Auth App | Session-Cookie (HMAC-signed), Env-Admin + multi-user Tabelle |
| M365 | Microsoft Graph REST `https://graph.microsoft.com/v1.0` + Entra OAuth2 v2 (Authorization Code + Refresh Token), **kein MSAL-Browser-Flow** (alles serverseitig) |
| AI | OpenAI SDK (`openai`), `response_format: { type: "json_object" }` + **Zod**-Validierung — **kein** `generateObject` erzwingen |
| Deploy | Multi-stage **Dockerfile** (Node 22 bookworm-slim), `docker-compose.yml`, Volume `./data` |
| Runtime APIs | `export const runtime = "nodejs"` + `dynamic = "force-dynamic"` für Graph/SQLite-Routen |

Package-Skripte: `dev`, `build`, `start`, `db:init`, `auth:secrets`, `lint`.

`next.config.ts`: `serverExternalPackages` muss `better-sqlite3` enthalten.

---

## 2. Docker & Betrieb

### 2.1 Dockerfile

- Stage `deps`: `node:22-bookworm-slim`, Build-Tools für `better-sqlite3` (`python3 make g++`), `npm ci`
- Stage `builder`: `npm run build`
- Stage `runner`: Produktion, `PORT=3000`, `HOSTNAME=0.0.0.0`, `DATABASE_PATH=/app/data/m365desk.sqlite`
- Native Module + `.next` + `public` + nötige `lib`/`scripts` kopieren
- Entrypoint: bei Root `chown` auf gemountetes `./data`, dann Drop zu User `node` (uid 1000), dann `npm run start`
- Host-Hinweis bei Write-Fail: `sudo chown -R 1000:1000 ./data`

### 2.2 docker-compose.yml

```yaml
services:
  m365desk:
    image: m365desk:local
    build: .
    ports:
      - "${APP_PORT:-3200}:3000"
    environment:
      HOSTNAME: "0.0.0.0"
      PORT: "3000"
      DATABASE_PATH: /app/data/m365desk.sqlite
      APP_PUBLIC_URL: ${APP_PUBLIC_URL:-}
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
      OPENAI_MODEL: ${OPENAI_MODEL:-gpt-4o-mini}
      APP_USERNAME: ${APP_USERNAME:-admin}
      APP_PASSWORD: ${APP_PASSWORD:-}
      APP_PASSWORD_HASH: ${APP_PASSWORD_HASH:-}
      APP_SESSION_SECRET: ${APP_SESSION_SECRET:-}
      MICROSOFT_OAUTH_CLIENT_ID: ${MICROSOFT_OAUTH_CLIENT_ID:-}
      MICROSOFT_OAUTH_CLIENT_SECRET: ${MICROSOFT_OAUTH_CLIENT_SECRET:-}
      MICROSOFT_OAUTH_TENANT: ${MICROSOFT_OAUTH_TENANT:-organizations}
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

Kein Qdrant-Service.

### 2.3 Env-Variablen (`.env.example`)

```bash
# Public HTTPS origin for OAuth redirect (no trailing slash)
APP_PUBLIC_URL=https://m365desk.example.com

APP_PORT=3200

# Login
APP_USERNAME=admin
# Prefer hash: generate with auth:secrets script
APP_PASSWORD=
APP_PASSWORD_HASH=
APP_SESSION_SECRET=   # min 32 chars

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

# Optional Entra fallbacks (normally set in UI Einstellungen; UI/SQLite wins)
MICROSOFT_OAUTH_CLIENT_ID=
MICROSOFT_OAUTH_CLIENT_SECRET=
MICROSOFT_OAUTH_TENANT=organizations
```

**Priorität Credentials:** SQLite-Settings (UI) **vor** Env.

---

## 3. Entra / Microsoft OAuth (kritisch — README muss das erklären)

### 3.1 App-Registrierung (Azure Portal / Entra)

1. App-Registrierung (Work/School; Tenant GUID oder Multi-Org)
2. Authentifizierung → Platform **Web**
3. Redirect-URI:
   - Produktion: `{APP_PUBLIC_URL}/api/microsoft/oauth/callback`
   - Lokal (Compose-Port): `http://localhost:3200/api/microsoft/oauth/callback`
4. Client-Geheimnis erstellen
5. API-Berechtigungen — **delegiert**, Admin-Zustimmung:

| Scope | Zweck |
|-------|--------|
| `openid` `profile` `email` `offline_access` | Login + Refresh Token |
| `User.Read` | `/me` Probe |
| `Mail.ReadWrite` | Posteingang/Gesendet lesen, Drafts, Flags |
| `Mail.Send` | Scope mitnehmen; **v1 sendet nicht automatisch** — nur Drafts anlegen |
| `Calendars.ReadWrite` | Termine lesen, erledigen, verschieben, anlegen |
| `Tasks.ReadWrite` | Outlook To Do Listen/Tasks |

**Planner:** Graph `/me/planner/tasks` funktioniert in vielen Tenants ohne Extra-Scope. Falls 403: in README dokumentieren, dass ggf. zusätzliche Group-/Planner-Rechte nötig sind. App soll Planner-Fehler graceful anzeigen, nicht crashen. **`Group.Read` nicht zwingend in v1 anfordern**, aber als Troubleshooting erwähnen.

**Nicht** anfordern: Chat.*, Files.ReadWrite.All, Application Permissions (Client Credentials). Nur **delegated per User**.

### 3.2 OAuth-Flow (serverseitig)

- Authorize: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize`
- Token: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`
- `tenant`: Verzeichnis-GUID **oder** `organizations` (Default) / `common`
- `response_type=code`
- `scope` = Leerzeichen-join der Scopes oben
- `prompt=select_account` (nicht mit `consent` kombinieren — Entra lehnt kombinierte Prompts oft ab)
- `state` = base64url mit `{ userId, nonce }`; nonce in Settings speichern und im Callback prüfen (TTL ~15 Min)
- Token-Response: `refresh_token` **muss** kommen (`offline_access`); sonst klare Fehlermeldung «Consent/offline_access prüfen, neu verbinden»
- Access Token cachen inkl. `expiryDate`; vor Graph-Call refreshen (z.B. wenn < 60s Restlaufzeit)
- Tokens **pro App-User**: Setting-Key `microsoft_oauth_tokens_u{userId}` (JSON: refreshToken, accessToken, expiryDate, email, displayName, scope, updatedAt)
- App-Credentials: `microsoft_oauth_client_id`, `microsoft_oauth_client_secret`, `microsoft_oauth_tenant`
- OAuth-State: `microsoft_oauth_state_u{userId}`

### 3.3 Graph-Client

Zentrale Helper:

- `graphFetch(userId, path, init)` → Bearer, Base `https://graph.microsoft.com/v1.0`
- `graphJson<T>(...)` wirft `MicrosoftGraphError` mit status + body-snippet
- Prefer-Header wo sinnvoll: `Prefer: outlook.timezone="Europe/Zurich"`
- **Kein** offizielles Graph-SDK nötig — raw `fetch`

Helper für Scopes aus gespeichertem Token-`scope`-Feld:

- `hasMicrosoftMailScope`, `hasMicrosoftMailSendScope`, `hasMicrosoftCalendarScope`, `hasMicrosoftTasksScope`

---

## 4. Auth & Multi-User (für Kollegen)

### 4.1 App-Login

- Env-Admin (`APP_USERNAME` + Password oder Password-Hash + Session Secret ≥32 Zeichen)
- Cookie z.B. `m365desk_session`, HttpOnly, SameSite=lax, Secure in Production, TTL z.B. 30 Tage
- Tabelle `users` (id, username, password_hash, is_admin, active, created_at, …)
- Admin kann Kollegen anlegen (Username/Passwort, aktiv/inaktiv, optional is_admin)
- Login rate-limiten (pro IP)
- Alle `/api/microsoft/**` und geschützte Pages hinter Auth
- Public nur: `/login`, Auth-APIs, statische Assets

Skript `auth:secrets`: erzeugt `APP_PASSWORD_HASH` (scrypt) + `APP_SESSION_SECRET`.

### 4.2 Microsoft-Konto-Bindung

- Jeder eingeloggte User verbindet **sein** M365
- Admin: OAuth-Client-ID/Secret/Tenant **global** in Einstellungen
- User: «Microsoft 365 verbinden» → OAuth Start → Callback speichert Tokens unter seiner `userId`
- Disconnect löscht nur die Tokens dieses Users
- Env-Admin ohne DB-User: beim ersten Connect automatisch einen App-User anlegen oder klar verlangen, dass ein App-User existiert — Tokens brauchen eine stabile `userId`

---

## 5. Datenmodell (minimal, SQLite)

Implementiere `ensureInitialized()` / Migrationen idempotent.

**settings** (key/value/updated_at): OAuth client, OpenAI key/model, tokens, oauth state, day-analysis cache/job, `app_public_url`, …

**users**: App-Benutzer

**mail_analyses** (pro User + message):

```sql
PRIMARY KEY (user_id, message_id)
-- thread_id, subject, from_name, from_email, snippet
-- status: pending | applied | dismissed | error | ...
-- relevance, summary, analysis_json, suggestion_count, error
-- provider TEXT NOT NULL DEFAULT 'microsoft'
-- analyzed_at, updated_at
```

**mail_sender_prefs**: `(user_id, from_domain)` → applied_count, dismissed_count, timestamps (Triage-Learning)

**mail_applied_links** (empfohlen): was aus Mail angelegt wurde (event/task/draft ids, title, dates) für Dedup später

Optional:

- Day-analysis Job/Cache in **settings** als JSON: `ms_mail_day_analysis_u{userId}`, `ms_mail_day_cache_u{userId}` (max ~7 Tage-Caches)
- Kalender-Auswahl: `microsoft_calendars_json_u{userId}` falls mehrere Kalender

**Nicht** anlegen: Paperless-Tabellen, Qdrant, Finance, Trips, Maringo.

---

## 6. Feature-Scope (UI + Backend)

### 6.1 Navigation

Sidebar (deutsch):

- **Übersicht** `/` — heute: Termine, offene Tasks, kurze Mail-Highlights, Connect-Status
- **Microsoft 365** `/microsoft` — Hauptworkspace (Tabs)
- **Einstellungen** `/settings` — OpenAI, Entra App, Users (Admin), eigener M365-Connect (oder Connect unter Konto)
- Optional **Konto** `/account` — Connect/Disconnect/Probe/Kalenderauswahl

### 6.2 Workspace `/microsoft` — Tabs

Query: `?tab=mail|triage|calendar|planner` (+ `view=chronik|tagesanalysen`, `open=<messageId>`).

#### Tab A — Kalender (`tab=calendar`)

- Heutige Outlook-Termine via Graph `calendarView`
- Aktionen:
  - **Erledigt:** Kategorie `M365Desk/Erledigt` + optional Prefix `✅ ` im Subject (idempotent)
  - **Freie Slots vorschlagen:** nächste ~7 Tage, Arbeitszeit default 08:00–18:00 Europe/Zurich, Kollisionen lokal aus Busy-Blöcken berechnen (nicht zwingend Graph `findMeetingTimes`)
  - **Verschieben:** PATCH Event start/end; Titel-Prefix `➡️ ` + Kategorie `M365Desk/Verschoben`
- Link «In Outlook» (`webLink`)

#### Tab B — Mail (`tab=mail`)

- Subviews:
  - **Chronik** (`view=chronik`): Inbox + Gesendet für Datumsrange (max 7 Tage, Zurich)
  - **Tagesanalysen** (`view=tagesanalysen`): siehe Tab D
- Detail-Overlay: From, Subject, received/sent, Body (HTML sanitized oder Text+plain)
- Kein voller Ordnerbaum
- Attachments listen/download: Phase 1c optional

#### Tab C — Triage (`tab=triage`)

- Pending Analysen aus `mail_analyses` (`provider=microsoft`)
- Button «Analysieren» pro Mail → OpenAI JSON → Vorschläge
- Apply: User wählt Aktionen → Graph Writes
- Dismiss: Status + Sender-Pref
- Schema **nur office-relevant**: `event` | `task` | `note` | `replyDraft`
- **Keine** finance/trip/paperless-Kinds

#### Tab D — Tagesanalyse (Teil von Mail oder eigener Subview)

- Input: Inbox+Sent eines Tages/Range (max 7 Tage), kompakt an AI
- Async Job empfohlen (`maxDuration` hoch genug, Status per GET pollbar), Cache in settings
- Output Zod-Schema:

```ts
daySummary: string
clusters: Array<{
  company: string
  counterpartEmail?: string | null
  theme: string
  conversationId?: string | null
  summary: string
  mailIds: string[]
  status?: "open" | "waiting" | "done" | "fyi"
  tasks: Array<{
    title: string
    notes?: string | null
    dueDate?: string | null // YYYY-MM-DD
    sourceMailId?: string | null
    sourceSubject?: string | null
    company?: string | null
    counterpartEmail?: string | null
    theme?: string | null
    reason?: string
  }>
  events: Array<{
    title: string
    date: string // YYYY-MM-DD
    startTime?: string | null // HH:mm
    endTime?: string | null
    allDay?: boolean
    location?: string | null
    notes?: string | null
    sourceMailId?: string | null
    reason?: string
  }>
  replies: Array<{
    to: string
    subject: string
    body: string
    language?: "de" | "en"
    sourceMailId?: string | null
    reason?: string
  }>
}>
```

- Nach Analyse: Matching gegen bestehende Outlook To Do (+ optional Planner) → `existingTask` anreichern
- Apply-Dialog: User editiert → batch create:
  - Tasks → Outlook To Do
  - Events → Outlook Calendar
  - Replies → Outlook **Drafts** (nicht auto-senden)
- Antwortsprache an Kundenmail anpassen (de/en); Translate-Endpoint optional (`AW:` vs `Re:`)

#### Tab E — Planner / Tasks (`tab=planner`)

- Outlook To Do: offene Tasks, erledigen/PATCH
- Planner-Panel: `/me/planner/tasks`, erledigen (`percentComplete` 100 + ETag), optional Bucket/Due — Fehlerfreundlich bei 403

### 6.3 Einstellungen / Konto

1. **OpenAI:** API-Key (masked GET), Model (Default `gpt-4o-mini`)
2. **Microsoft App (Admin):** Client-ID, Secret, Tenant, Anzeige Redirect-URI zum Copy-Paste in Entra
3. **Mein Microsoft 365:** Connect / Disconnect / Probe (`/me` + heutige Termine)
4. **Kalender-Auswahl (optional):** welche Graph-Kalender in der App relevant sind
5. **Benutzer (Admin):** Kollegen anlegen

Probe: `{ ok, me: { displayName, mail }, calendar: { ok, todayEventCount, sampleTitles } }`

---

## 7. API-Routen (Soll-Liste)

Alles unter Auth außer Login/Public:

| Route | Methoden | Zweck |
|-------|----------|--------|
| `/api/auth/login` | POST | Login |
| `/api/auth/logout` | POST | Logout |
| `/api/auth/me` | GET | Session |
| `/api/microsoft/settings` | GET/PUT | OAuth Client/Tenant (Admin write) |
| `/api/microsoft/oauth/start` | GET | Redirect zu Entra |
| `/api/microsoft/oauth/callback` | GET | Code → Tokens, Redirect UI |
| `/api/microsoft/oauth/disconnect` | POST | Tokens löschen |
| `/api/microsoft/connection` | GET | connected?, email, scope flags |
| `/api/microsoft/probe` | GET | Smoke test |
| `/api/microsoft/calendars` | GET/(PUT) | Kalenderliste / Auswahl |
| `/api/microsoft/calendar/today` | GET | Heutige Events |
| `/api/microsoft/calendar/actions` | POST | `done` \| `suggest_slots` \| `reschedule` |
| `/api/microsoft/mail/list` | GET | `?filter=today\|week\|unread` |
| `/api/microsoft/mail/today` | GET | Inbox+Sent Range (`from`/`to`/`date`, max 7d) |
| `/api/microsoft/mail/[id]` | GET | Detail |
| `/api/microsoft/mail/[id]/attachments` | GET | optional |
| `/api/microsoft/mail/[id]/analyze` | POST | Single-mail AI |
| `/api/microsoft/mail/[id]/actions` | POST | Apply triage suggestions |
| `/api/microsoft/mail/triage` | GET/POST | Pending list / dismiss |
| `/api/microsoft/mail/analyze` | GET/POST | Day-Job Status / Start `{ date?, from?, to? }` |
| `/api/microsoft/mail/apply` | POST | Day-Apply `{ tasks[], events[], replies[] }` |
| `/api/microsoft/mail/translate-reply` | POST | optional `{ subject, body, targetLang }` |
| `/api/microsoft/planner/tasks` | GET/PATCH | Planner list/update |
| `/api/tasks` | GET/PATCH | Home: Outlook To Do (+ Planner) |
| `/api/settings/openai` | GET/PUT | OpenAI |
| `/api/users` | CRUD Admin | Kollegen |

Calendar actions body:

```ts
{ action: "done", eventId: string }
| { action: "suggest_slots", eventId: string, rangeStart?, rangeEnd?, workStartHm?, workEndHm? }
| { action: "reschedule", eventId: string, date: "YYYY-MM-DD", startHm: "HH:mm", endHm: "HH:mm" }
```

---

## 8. AI-Regeln (wichtig)

- Immer `chat.completions` + `response_format: { type: "json_object" }`
- Model: Settings/Env, Default `gpt-4o-mini`
- Single-mail: eher `temperature: 0.2`
- Day-analyse: eher `temperature: 0.35`
- System-Prompt: Büro-Assistent Schweiz, `Europe/Zurich`, absolute Daten, keine Halluzinationen, Newsletter/Werbung → leere suggestions
- Zod-parse; bei Fail Retry einmal oder klare Error-UI
- Token-Usage optional anzeigen
- **Kein** Image-Input, **kein** `images.generate`, **kein** Vision
- Keys nur Server-side; nie an Client leaken (masked in settings GET)
- Post-process: Firmen/Absender-Labels aus Domain; Schweizer Orthografie; Task-Due Default sinnvoll (z.B. Range-Ende + 1 Tag)

Single-Mail Schema (v1):

```ts
{
  summary: string
  relevance: "high" | "medium" | "low" | "none" // oder ähnlich
  suggestions: Array<
    | { kind: "event"; title; startDate?; startTime?; endTime?; allDay?; location?; notes? }
    | { kind: "task"; title; dueDate?; notes? }
    | { kind: "note"; title; reference?; notes? }
  >
  replyDraft?: { to; subject; body; language?: "de" | "en" } | null
}
```

---

## 9. Graph Write-/Read-Primitive (Referenzverhalten)

### Events

- List: `/me/calendarView?startDateTime&endDateTime` (+ `$select`, `$orderby`)
- Create: `POST /me/events` (subject, start/end timeZone Europe/Zurich, location, body)
- Done: PATCH categories + optional subject prefix
- Reschedule: PATCH start/end + Verschoben-Marker

### Free slots

Lokal aus calendarView-Busy-Blöcken im Arbeitsfenster berechnen.

### Outlook To Do

- Listen: `/me/todo/lists` → Default-/Tasks-Liste resolven
- Create: `POST /me/todo/lists/{id}/tasks`
- List/Update: GET/PATCH tasks; Status map open/done

### Mail

- Inbox/Sent listen mit `$filter` auf receivedDateTime/sentDateTime im Zurich-Tagesfenster
- Detail: `GET /me/messages/{id}`
- Draft: `POST /me/messages` mit `isDraft: true` **oder** `createReply` auf vorhandene Message — **kein Auto-Send in v1**
- Optional Attachments: `/me/messages/{id}/attachments`

### Planner

- `GET /me/planner/tasks`
- PATCH mit `If-Match` ETag
- Buckets: `/planner/plans/{id}/buckets`

---

## 10. UX-Leitplanken

- Deutsch, klar, produktiv — kein Marketing-Landing
- Workspace-Tabs: Kalender | Mail (Chronik/Tagesanalysen) | Triage | Planner
- Status-Chips, leere Zustände mit Connect-CTA
- Graph-Writes erst nach Bestätigung (außer explizites «Erledigt»)
- Graph-Fehler als deutsche Meldungen (403 Scope → «Bitte Microsoft 365 neu verbinden»)
- Mobile brauchbar, Desktop primary
- Schlichte App-Shell (Sidebar + Content), keine überladene Dashboard-Ästhetik
- Antwort-Subjects: DE `AW:`, EN `Re:`

---

## 11. Sicherheit

- Secrets nur Env/SQLite server-side
- OAuth `state` prüfen
- HTML aus Mail: DOMPurify oder striktes Sanitize vor `dangerouslySetInnerHTML`
- Keine Logs mit Access Tokens / vollen Mail-Bodies in Production
- Tokens in SQLite **ohne** Extra-Verschlüsselung ist für v1 ok — in README als Risiko erwähnen (Dateirechte / Volume absichern)
- Login rate-limit

---

## 12. README muss enthalten

1. Lokal mit `npm run dev` + `DATABASE_PATH`
2. Docker Compose Build/Up, Port, `chown` Hinweis (`sudo chown -R 1000:1000 ./data`)
3. Entra App-Registrierung Schritt-für-Schritt inkl. Redirect URI und Scopes
4. Erster Start: Admin-Login → OpenAI Key → Entra Client speichern → M365 verbinden → Probe
5. Kollegen-User anlegen
6. Troubleshooting:
   - kein Refresh Token / offline_access
   - 403 Tasks.ReadWrite → neu verbinden
   - Redirect URI mismatch / `APP_PUBLIC_URL`
   - data directory permissions
   - Planner 403 / fehlende Group-Rechte
7. Klarstellung: Antworten = Drafts, kein Auto-Send

---

## 13. Liefer-Reihenfolge (so abarbeiten)

1. Scaffold Next 16 + Tailwind + SQLite bootstrap + Auth login
2. Dockerfile + compose + `.env.example` + entrypoint
3. Settings OpenAI + Microsoft App credentials
4. OAuth start/callback/disconnect/probe + connection UI
5. Calendar today + done/slots/reschedule
6. Mail list/detail (Chronik)
7. To Do list/update + Home tasks
8. Single-mail analyze + triage apply/dismiss
9. Day-analyze job + apply (tasks/events/drafts) + optional translate
10. Planner panel (graceful)
11. Admin user management
12. README + manuelle Checkliste

Nach jedem großen Schritt: Typecheck/build grün halten.

---

## 14. Acceptance Criteria

- [ ] `docker compose up --build` startet App auf Host-Port (Default 3200)
- [ ] Login mit Env-Credentials funktioniert
- [ ] Entra-Client in UI speicherbar; Redirect-URI sichtbar
- [ ] User kann M365 verbinden und Probe ok sehen
- [ ] Heutige Termine laden; Erledigt + Verschieben funktioniert
- [ ] Mails heute laden und lesen (Inbox + Gesendet)
- [ ] Mit OpenAI: Single-Mail-Analyse + Apply Task/Event/Draft nach Outlook
- [ ] Tagesanalyse erzeugt Cluster und schreibt nach Bestätigung nach Outlook (To Do / Kalender / Draft)
- [ ] To Do-Aufgaben sichtbar/erledigbar
- [ ] Planner zeigt Tasks oder eine klare Fehlermeldung
- [ ] Zweiter App-User kann eigenes M365 verbinden (getrennte Tokens)
- [ ] Kein Maringo-, Google-, Paperless-, Image-AI-, Qdrant-Code im Repo

---

## 15. Referenz aus Buddy (nur als Konzept — nicht kopieren/clonen)

Bewährte Patterns aus einer bestehenden App (Names/Branding anders wählen):

- Settings-KV in SQLite schlägt Env
- Per-User OAuth Tokens `microsoft_oauth_tokens_u{id}`
- Scopes: `openid profile email offline_access User.Read Mail.ReadWrite Mail.Send Calendars.ReadWrite Tasks.ReadWrite`
- Kalender soft-done via Kategorien statt Löschen
- Day-Analyse max 7 Tage, Zurich
- Apply replies = Drafts
- Docker: Node 22, better-sqlite3, volume `./data`, entrypoint chown uid 1000

Modul-Ideen (neu schreiben, nicht 1:1 porten):

- `lib/microsoft/oauth.ts`, `graph.ts`, `calendar-review.ts`, `mail-day.ts`, `mail-day-actions.ts`, `analyze-mail-day.ts`, `planner.ts`
- `lib/mail/analyze-mail.ts`, `mail-action-schema.ts`, `mail-analysis-store.ts`
- UI: eine Workspace-Client-Komponente mit Tabs

---

## 16. Arbeitsweise

- Keine Platzhalter-TODOs in kritischen Pfaden — lieber schlanke v1
- Keine Secrets committen
- Wenn Entra-Tenant-Details unbekannt: Default `organizations` + klare UI-Felder
- Bei Unklarheiten kurze Annahme im README dokumentieren und weiterbauen (nicht blockieren)
- Next-16-Docs lesen bevor APIs geraten werden

**Starte jetzt mit Projekt-Scaffold und Docker-Grundgerüst, dann OAuth, dann Kalender/Mail, dann AI.**
