# Google OAuth — Vorbereitung (Mail + Geburtstage)

Status: **Mail + Geburtstage umgesetzt** — Gmail API + Calendar API
(`eventTypes=birthday`), Scope `calendar.readonly`.

## Kurzantwort

| Feature | ICS-URL nötig? | Mit OAuth |
|---------|----------------|-----------|
| **Mail (Gmail)** | nein | ja — Gmail API, `gmail.readonly` |
| **Geburtstage (Google «Geburtstage»-Kalender)** | nein (gibt keine Geheimadresse) | ja — Calendar API, `eventTypes=birthday` |

Ein **Google-Cloud-Projekt**, **ein OAuth-Client**, **ein verbundenes Konto** reichen für Phase 1.

---

## Schritt 1 — Entscheidungen treffen

1. **Welches Google-Konto** soll Buddy verbinden?
   - Empfehlung: das Konto, in dem **Mail + Kontakte/Geburtstage** zusammenlaufen (z. B. privates Gmail oder ein Familien-Workspace-User).
2. **Nur ein Postfach** in Phase 1 (kein Multi-User).
3. **Buddy-URL** festlegen (Produktion + ggf. lokal):
   - z. B. `https://buddy.example.com`
   - lokal (Docker): `http://localhost:3100`

---

## Schritt 2 — Google Cloud Projekt

1. [Google Cloud Console](https://console.cloud.google.com/) öffnen
2. Neues Projekt, z. B. **`buddy-google`**
3. **APIs & Dienste → Bibliothek** — aktivieren:
   - **Gmail API**
   - **Google Calendar API**
   - optional **Google People API** (nur falls Geburtstage direkt aus Kontakten statt nur aus dem Kalender)

---

## Schritt 3 — OAuth-Zustimmungsbildschirm

1. **APIs & Dienste → OAuth-Zustimmungsbildschirm**
2. Typ: **Intern** (Workspace-Organisation) — ideal für Familie/Firma  
   *(bei rein privatem `@gmail.com`: **Extern** + Testnutzer hinzufügen)*
3. App-Name: **Buddy**, Support-E-Mail = deine Admin-Mail
4. **Scopes** (später bei Umsetzung eintragen, jetzt schon planen):

| Scope | Zweck |
|-------|--------|
| `https://www.googleapis.com/auth/gmail.readonly` | Posteingang lesen |
| `https://www.googleapis.com/auth/userinfo.email` | Welches Konto verbunden ist |
| `https://www.googleapis.com/auth/calendar.readonly` | Geburtstage + ggf. andere Kalender lesen |
| optional `https://www.googleapis.com/auth/contacts.readonly` | Geburtstage direkt aus Kontakten |

Phase 1 Mail: nur die ersten zwei. Geburtstage: mindestens `calendar.readonly` dazu.

---

## Schritt 4 — OAuth-Client (Web)

1. **Anmeldedaten → + Anmeldedaten erstellen → OAuth-Client-ID**
2. Typ: **Webanwendung**
3. **Autorisierte Weiterleitungs-URIs** (Platzhalter — exakte Pfade bei Umsetzung):

```
https://buddyapp.rolfwalker.ch/api/google/oauth/callback
```

Lokal optional (Docker-Host-Port **3100**); Google akzeptiert localhost nicht immer — dann nur über HTTPS-Produktion verbinden:

```
http://localhost:3100/api/google/oauth/callback
```

Buddy baut die Redirect-URI aus `APP_PUBLIC_URL` / Einstellung «Öffentliche App-URL» + Pfad `/api/google/oauth/callback`.

4. **Client-ID** und **Client-Secret** sicher notieren → später in Buddy-Settings / `.env`, **nicht ins Git**

---

## Schritt 5 — Workspace-Admin (falls Firmen-/Schul-Domain)

Prüfen, ob blockiert:

- **Admin-Konsole → Sicherheit → API-Steuerung** / **App-Zugriff**
- Gmail- und Calendar-API für OAuth-Apps erlaubt?
- Scope «nur lesen» für interne App freigegeben?

Bei **Intern**-OAuth in derselben Domain meist unkritisch. Bei Problemen: Admin fragen oder Test mit `@gmail.com`-Konto.

---

## Schritt 6 — In Google selbst prüfen (vor der Umsetzung)

### Mail

- [ ] Im gewählten Konto: Posteingang normal nutzbar
- [ ] Du bist bereit, Buddy **Lesezugriff** zu geben (readonly)

### Geburtstage

- [ ] In [Google Kalender](https://calendar.google.com): links Kalender **«Geburtstage»** sichtbar und aktiviert
- [ ] Unter **Einstellungen → Geburtstage**: Kontakte-/Kalender-Geburtstage eingeschaltet
- [ ] In **Google Kontakte**: mindestens einige Kontakte mit **Geburtsdatum** gepflegt
- [ ] Erwartung: Geburtstage erscheinen im Kalender (auch ohne ICS-URL)

Hinweis: Der System-Kalender «Geburtstage» hat **keine** «Geheimadresse im iCal-Format» — deshalb OAuth/Calendar API.

---

## Schritt 7 — Was du für die Umsetzung bereithältst

Checkliste zum Abhaken:

- [ ] Google-Cloud-**Projekt-ID** / Name
- [ ] **Client-ID**
- [ ] **Client-Secret** (einmalig sicher übergeben)
- [ ] **Buddy-Produktions-URL**
- [ ] **E-Mail-Adresse** des zu verbindenden Kontos
- [ ] OAuth-Typ bestätigt: **Intern** oder **Extern + Testuser**
- [ ] Optional: gewünschte Mail-Labels («nur Primary», «Schule», …) — später

---

## Was Buddy später damit macht (Plan)

### Mail

- **Übersicht:** «Heute · Mail», 3–5 Einträge
- **Menü Mail:** Liste + Overlay zum Lesen
- API: Gmail `users.messages.list` / `get`, Cache kurz

### Geburtstage

- **Calendar API:** `events.list` mit `eventTypes=birthday` (jährlich, aus Kontakten sync)
- Quelle `google-birthdays` in Agenda / Heute / `/calendar` (Typ Geburtstag, Torten-Icon)
- Bestehende Verbindung ohne Kalender-Scope: in Settings «Neu verbinden (Kalender)»
- **Kein** manueller ICS-Kalender nötig, solange OAuth mit `calendar.readonly` aktiv ist
- Alternative (nicht nötig): People API `birthdays`-Feld pro Kontakt

---

## Sicherheit

- Secret Address / OAuth-Tokens wie Passwörter behandeln
- Nur **readonly**-Scopes in Phase 1
- Ein Konto reicht; Tokens in Buddy DB/Settings verschlüsselt speichern (wie andere Secrets)
- Bei Leak: Secret in Cloud Console **zurücksetzen**, in Buddy neu verbinden

---

## Erledigt

Mail + Geburtstage laufen über denselben Google-OAuth. Nach Scope-Erweiterung einmal **neu verbinden**, damit `calendar.readonly` greift. In der Cloud Console muss die **Google Calendar API** aktiviert sein.

Smoke-Test: Heute · Termine / `/calendar` zeigt Geburtstage; Mail weiterhin lesbar.
