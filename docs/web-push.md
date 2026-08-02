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

Zeilen in die Host-`.env` einfügen. Die Variablen müssen in `docker-compose.yml`
unter `environment` stehen (sonst sieht der Container sie nicht). Dann:

```bash
docker compose up -d --force-recreate familybrain
```

Nur `restart` reicht nicht immer — neu erstellen, damit Env neu gelesen wird.

## In der App

Einstellungen → Live-Benachrichtigungen → **Push aktivieren**.
Event «Neuer Reise-Kommentar» (und andere) wie gewohnt filtern.

Push-Benachrichtigungen enthalten das passende AI-Bild (Dokument-/Ereignis-/Ausgabenbild)
als `icon` und — wo das OS es unterstützt — als grosses `image` beim Aufklappen.
Die Bilder werden über kurzlebige, signierte URLs unter `/api/push/media` geladen
(ohne Login-Cookie; Signatur mit `FAMILYBRAIN_SESSION_SECRET`).

## Dev

```bash
npm run push:vapid
```
