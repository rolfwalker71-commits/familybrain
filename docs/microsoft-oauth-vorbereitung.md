# Microsoft 365 / Entra — Vorbereitung für Buddy

## Redirect-URI (zusätzlich zur bestehenden App-URL)

```
https://buddyapp.rolfwalker.ch/api/microsoft/oauth/callback
```

Entra → App-Registrierung → Authentifizierung → Umleitungs-URI (Typ **Web**).

## Berechtigungen (delegiert, Admin-Zustimmung)

Bereits vorhanden bei dir:

- `Calendars.ReadWrite`
- `Mail.ReadWrite`
- `Mail.Send`
- `offline_access`
- `openid` / `profile` / `email` / `User.Read`

## In Buddy

1. **Einstellungen → Kalender → Microsoft 365 OAuth**
   - Anwendungs-ID (Client)
   - Client-Geheimnis
   - Tenant: Verzeichnis-ID **oder** `organizations`
2. **Konto → Mein Microsoft 365** → verbinden als `rolf.walker@an-group.one`
3. **Verbindung testen** (Graph `/me` + heutige Termine)

## Nächste Ausbaustufen (noch nicht)

- Abend-Review: Termine erledigt / verschieben auf freie Slots
- Tages-Mails: Inbox + Sent → Summary + Aufgaben-Vorschläge
