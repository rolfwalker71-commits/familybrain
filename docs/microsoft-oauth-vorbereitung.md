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

## Nächste Ausbaustufen

Umgesetzt unter **`/microsoft`**:

- **Kalender-Review:** heutige Termine → Erledigt (Kategorie `Buddy/Erledigt`) oder Verschieben auf freie Slots (nächste 7 Tage, 08–18)
- **Mail-Tag:** Posteingang + Gesendet → AI-Tagesanalyse + Aufgaben (Google Tasks oder Buddy-Notiz)
