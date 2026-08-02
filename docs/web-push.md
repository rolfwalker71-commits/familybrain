# Web Push (VAPID)

Buddy sendet die bestehenden Live-Notify-Events (z. B. Reise-Kommentar) zusätzlich
als Web Push, wenn VAPID konfiguriert ist und der Nutzer Push aktiviert hat.

## Docker (Host `.env`)

Keys erzeugen (kein `npm` im Compose-Ordner nötig):

```bash
docker run --rm -w /tmp node:22-bookworm-slim sh -c '
  npm install web-push@3.6.7 >/dev/null 2>&1
  node -e "
    const { generateVAPIDKeys } = require(\"web-push\");
    const k = generateVAPIDKeys();
    console.log(\"VAPID_PUBLIC_KEY=\" + k.publicKey);
    console.log(\"VAPID_PRIVATE_KEY=\" + k.privateKey);
    console.log(\"VAPID_SUBJECT=mailto:you@example.com\");
  "
'
```

Zeilen in die Host-`.env` einfügen, dann:

```bash
docker compose pull
docker compose up -d
```

## In der App

Einstellungen → Live-Benachrichtigungen → **Push aktivieren**.
Event «Neuer Reise-Kommentar» (und andere) wie gewohnt filtern.

## Dev

```bash
npm run push:vapid
```
