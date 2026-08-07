# Mail-Integration

Status: **Phase 1 umgesetzt** (OAuth + Lesen + Übersicht-Auszug).  
Erstellt: 2026-08-06 · Umsetzung: 2026-08-06.

## Ziel

Buddy zeigt Gmail zentral — lesen/überblicken, kein voller Client.

## UI

| Ort | Inhalt |
|-----|--------|
| **Übersicht** | «Heute · Mail», max. 5, Link Posteingang |
| **Menü Mail** (`/mail`) | Heute / Woche / Ungelesen, Overlay zum Lesen |
| **Einstellungen → Kalender** | Google OAuth Client-ID/Secret + Verbinden |

## Technik

- Gmail API + Calendar API + OAuth (`gmail.readonly`, `userinfo.email`, `calendar.readonly`)
- App-weit: Client-ID/Secret in Settings (oder Env `GOOGLE_OAUTH_CLIENT_*`)
- Tokens pro App-User (`google_oauth_tokens_u{id}`), Owner wie ICS via `resolveCalendarUserId`
- Callback: `/api/google/oauth/callback`
- APIs: `/api/mail/list`, `/api/mail/today`, `/api/mail/[id]`
- Geburtstage: `lib/google/birthdays.ts` → Agenda-Quelle `google-birthdays`

## Redirect-URI in Google Cloud

**Ausreichend (empfohlen):** nur die öffentliche Buddy-URL — OAuth dort verbinden:

```
https://<buddy-domain>/api/google/oauth/callback
```

Lokal (Docker) wäre der Host-Port **3100**, nicht 3000:

```
http://localhost:3100/api/google/oauth/callback
```

Google lässt `http://localhost` manchmal nicht zu bzw. ist unnötig, wenn du die Verbindung über die HTTPS-Produktions-URL herstellst. Die Redirect-URI in den Buddy-Einstellungen folgt `app_public_url` bzw. dem aktuellen Host.

## Setup kurz

1. Client-ID + Secret unter Einstellungen → Kalender speichern
2. Redirect-URI in Google Cloud eintragen
3. App-User (z. B. Rolf) vorhanden / angemeldet
4. «Google verbinden» auf Mail-Seite oder in Settings
5. Bei fehlendem Refresh-Token: App-Zugriff in Google widerrufen und erneut verbinden (`prompt=consent`)

## Noch nicht

- Als gelesen markieren, Senden, Labels/Filter, Geburtstage via Calendar API
