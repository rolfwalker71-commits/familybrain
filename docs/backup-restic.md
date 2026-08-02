# Sicherungs- und Restore-Konzept (restic + Hetzner Storage Box per SFTP)

Restore-taugliches Backup für **Buddy (FamilyBrain)** und **Paperless-ngx** auf derselben Maschine (VM oder LXC).
Ziel: Neue Instanz aufsetzen → App/Compose pullen → Restore → Stand der Sicherung.

**Standardweg: SFTP** — restic spricht die Storage Box direkt per SSH/SFTP an.  
**Kein CIFS-Mount** nötig (vermeidet `permission denied` / `Operation not permitted` in LXC-Containern).

---

## 1. Was wird gesichert?

| Bereich | Inhalt | Warum |
|---------|--------|--------|
| **Buddy `./data/`** | SQLite (+ WAL), Medien (Trips, Finanzen, Avatare, Icons, Guides) — **ohne `qdrant/`** | App-Stand; Embeddings neu aufbaubar |
| **Buddy `.env`** | Admin-Login, Session-Secret, Ports, Image-Tag | Ohne `.env` startet die App nicht wie zuvor |
| **Buddy `docker-compose.yml`** | Optional (kommt auch aus dem Repo) | Pinnt Compose am Backup-Tag |
| **Paperless Volumes** | `media` (PDFs), DB (`pgdata` oder SQLite-`data`) | Originaldokumente + Metadaten |
| **Paperless `.env` + compose** | Secrets, URLs, Versionen | Stack wieder hochfahren |

**Nicht im Backup:** Redis (ephemeral), **Qdrant** (Vektorindex — nach Restore neu indexieren).  
**Nicht in Buddy:** PDFs liegen nur in Paperless.

---

## 2. Architektur (einfach)

```text
┌────────────── Server (VM / LXC) ──────────────┐
│  /opt/familybrain/     Buddy + ./data         │
│  /opt/paperless/       Paperless + volumes    │
│  /var/backups/.../     lokales Staging        │
│  /usr/local/sbin/      backup-Skript          │
│  /etc/buddy-backup/    restic.env + SSH-Key   │
└───────────────────┬───────────────────────────┘
                    │ SFTP (oft Port 23)
                    ▼
┌──────── Hetzner Storage Box ─────────────────┐
│  /home/restic-repo/     restic repository    │
└──────────────────────────────────────────────┘
```

Lokales Staging → `restic backup` über SFTP ins Repo auf der Box.

```text
/var/backups/buddy-paperless/staging/
  buddy/
    data/              # ohne qdrant/
    env
    docker-compose.yml
  paperless/
    media/
    pgdata/
    env
    docker-compose.yml
  MANIFEST.txt
```

---

## 3. Storage Box per SFTP vorbereiten

### 3.1 Voraussetzungen (Hetzner Robot / Cloud Console)

- Storage Box angelegt (z. B. BX11+)
- **SSH-/SFTP-Zugang** aktiviert
- Benutzer `uXXXXX`, Hostname `uXXXXX.your-storagebox.de`
- **Wichtig:** Hetzner Storage Box SSH/SFTP läuft meist auf **Port 23** (nicht 22)

### 3.2 SSH-Key für restic (nicht interaktiv)

Auf dem Server (als root, wo das Backup läuft):

```bash
sudo mkdir -p /root/.ssh
sudo chmod 700 /root/.ssh
sudo ssh-keygen -t ed25519 -f /root/.ssh/storagebox_ed25519 -N "" -C "buddy-restic"
sudo cat /root/.ssh/storagebox_ed25519.pub
```

Public Key in der **Hetzner Storage-Box-Oberfläche** hinterlegen (SSH-Keys), oder per Dokumentation der Box in `authorized_keys` auf der Box.

SSH-Config:

```bash
sudo tee /root/.ssh/config >/dev/null <<'EOF'
Host storagebox
  HostName u64439.your-storagebox.de
  User u64439
  Port 23
  IdentityFile /root/.ssh/storagebox_ed25519
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
EOF
sudo chmod 600 /root/.ssh/config
```

(`u64439` / Host durch deine Werte ersetzen.)

Verbindungstest:

```bash
sftp storagebox
# oder:
ssh -p 23 u64439@u64439.your-storagebox.de
```

Im SFTP-Home Verzeichnis für restic anlegen:

```bash
sftp storagebox <<'EOF'
mkdir restic-repo
bye
EOF
```

Pfad auf der Box ist typischerweise `/home/restic-repo` (je nach Box-Layout auch `/home/u64439/restic-repo` — mit `pwd` / `ls` im SFTP prüfen).

### 3.3 Warum nicht CIFS?

In vielen Setups (besonders **LXC**/Proxmox) schlägt `mount -t cifs` fehl mit:

- `permission denied`
- `Operation not permitted`
- `bad option` / fehlendes `mount.cifs`

SFTP braucht **keinen Kernel-Mount** und funktioniert im Container wie auf der VM.

---

## 4. restic einrichten (einmalig)

### 4.1 Install

```bash
sudo apt update && sudo apt install -y restic openssh-client
restic version
```

### 4.2 Passwort-Datei (nie ins Git)

```bash
sudo mkdir -p /etc/buddy-backup
openssl rand -base64 32 | sudo tee /etc/buddy-backup/restic-password >/dev/null
sudo chmod 600 /etc/buddy-backup/restic-password
```

**Wichtig:** Passwort offline notieren (Password-Manager). Ohne es ist das Repo wertlos.

### 4.3 Environment-Datei

`/etc/buddy-backup/restic.env`:

```bash
# Host-Alias aus /root/.ssh/config → Port 23 + Key greifen automatisch
export RESTIC_REPOSITORY="sftp:storagebox:/home/restic-repo"
export RESTIC_PASSWORD_FILE="/etc/buddy-backup/restic-password"
export RESTIC_PACK_SIZE=32
```

Alternative ohne SSH-Alias (Port in der URL):

```bash
export RESTIC_REPOSITORY="sftp://u64439@u64439.your-storagebox.de:23//home/restic-repo"
```

```bash
sudo chmod 600 /etc/buddy-backup/restic.env
```

### 4.4 Repository initialisieren

```bash
source /etc/buddy-backup/restic.env
restic init
restic snapshots
```

Staging-Verzeichnisse lokal:

```bash
sudo mkdir -p /var/backups/buddy-paperless/{staging,logs}
```

---

## 5. Konsistenzregeln (Restore-Proof)

| Stack | Vor dem Kopieren | Warum |
|-------|------------------|--------|
| **Buddy** | `docker compose stop familybrain` (Qdrant darf laufen) **oder** SQLite-WAL-Checkpoint | WAL nicht halb geschrieben |
| **Paperless** | `docker compose stop` | Medien + DB konsistent |
| **Danach** | Staging → `restic backup` (SFTP) → Services wieder `up -d` | Downtime klein halten |

Kein live-`cp` der SQLite-Datei ohne Checkpoint/Stop.

---

## 6. Backup-Skript (täglich)

Datei: `/usr/local/sbin/buddy-paperless-backup.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

source /etc/buddy-backup/restic.env

STAGING=/var/backups/buddy-paperless/staging
LOG=/var/backups/buddy-paperless/logs/backup-$(date +%F).log
BUDDY_DIR=/opt/familybrain          # anpassen
PAPERLESS_DIR=/opt/paperless        # anpassen
PAPERLESS_MEDIA=/var/lib/docker/volumes/paperless_media/_data   # anpassen!
PAPERLESS_PGDATA=/var/lib/docker/volumes/paperless_pgdata/_data # anpassen!

mkdir -p "$(dirname "$LOG")"
exec > >(tee -a "$LOG") 2>&1
echo "=== backup start $(date -Is) ==="

case "${RESTIC_REPOSITORY:-}" in
  sftp:*|sftp://*)
    echo "OK: SFTP-Repository $RESTIC_REPOSITORY"
    ;;
  *)
    echo "ERROR: RESTIC_REPOSITORY muss sftp:… sein (siehe docs/backup-restic.md)"
    exit 1
    ;;
esac

# Kurzer Erreichbarkeitstest (SSH/SFTP)
if ! restic cat config >/dev/null 2>&1; then
  echo "ERROR: restic erreicht das Repo nicht (SSH-Key, Port 23, Pfad?)"
  echo "Test: sftp storagebox   bzw.   source /etc/buddy-backup/restic.env && restic snapshots"
  exit 1
fi

copy_env_file() {
  local dest="$1"
  if [[ -f .env ]]; then
    cp -a .env "$dest"
  elif [[ -f .env.local ]]; then
    echo "WARN: keine .env — kopiere .env.local → $dest"
    cp -a .env.local "$dest"
  else
    echo "WARN: weder .env noch .env.local in $(pwd) — Staging ohne Env-Datei"
  fi
}

rm -rf "$STAGING"
mkdir -p "$STAGING"/{buddy,paperless}

# --- Buddy konsistent (ohne qdrant/) ---
buddy_up() {
  (cd "$BUDDY_DIR" && docker compose start familybrain) || \
    (cd "$BUDDY_DIR" && docker compose up -d familybrain) || true
}
(
  set -euo pipefail
  cd "$BUDDY_DIR"
  docker compose stop familybrain
  trap buddy_up EXIT
  mkdir -p "$STAGING/buddy/data"
  rsync -a --delete \
    --exclude 'qdrant/' \
    --exclude 'qdrant/**' \
    ./data/ "$STAGING/buddy/data/"
  copy_env_file "$STAGING/buddy/env"
  cp -a docker-compose.yml "$STAGING/buddy/docker-compose.yml" 2>/dev/null || true
  trap - EXIT
  buddy_up
)

# --- Paperless konsistent ---
paperless_up() {
  (cd "$PAPERLESS_DIR" && docker compose up -d) || true
}
(
  set -euo pipefail
  cd "$PAPERLESS_DIR"
  docker compose stop
  trap paperless_up EXIT
  mkdir -p "$STAGING/paperless"/{media,pgdata}
  rsync -a --delete "$PAPERLESS_MEDIA"/ "$STAGING/paperless/media/"
  rsync -a --delete "$PAPERLESS_PGDATA"/ "$STAGING/paperless/pgdata/"
  copy_env_file "$STAGING/paperless/env"
  cp -a docker-compose.yml "$STAGING/paperless/docker-compose.yml" 2>/dev/null || true
  trap - EXIT
  paperless_up
)

{
  echo "host=$(hostname)"
  echo "time=$(date -Is)"
  echo "repo=${RESTIC_REPOSITORY}"
  echo "buddy_image=$(cd "$BUDDY_DIR" && docker compose images -q familybrain 2>/dev/null | head -1)"
  echo "qdrant=excluded"
  du -sh "$STAGING"/*/* 2>/dev/null || true
} > "$STAGING/MANIFEST.txt"

restic backup "$STAGING" \
  --tag buddy-paperless \
  --tag "host:$(hostname)" \
  --exclude '**/qdrant/**'

restic forget --tag buddy-paperless \
  --keep-daily 7 \
  --keep-weekly 4 \
  --keep-monthly 6 \
  --prune

restic check --read-data-subset=5%

STATUS_FILE="${BUDDY_BACKUP_STATUS_FILE:-$BUDDY_DIR/data/backup-status.json}"
if [[ -d "$(dirname "$STATUS_FILE")" ]]; then
  cat > "$STATUS_FILE" <<EOF
{
  "lastSnapshotAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "lastCheckAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "lastCheckOk": true,
  "repository": "${RESTIC_REPOSITORY:-}",
  "summary": "restic SFTP backup + check ok (qdrant excluded)"
}
EOF
fi

echo "=== backup done $(date -Is) ==="
```

```bash
sudo chmod 750 /usr/local/sbin/buddy-paperless-backup.sh
```

**Pfade anpassen:** `docker volume ls` / `docker volume inspect …`.

**`.env` fehlt?** Skript warnt und läuft weiter; Container starten per `trap` wieder.

---

## 7. Zeitsteuerung (cron)

```bash
sudo crontab -e
```

```cron
# Täglich 03:15 — SFTP zur Storage Box (kein Mount nötig)
15 3 * * * /usr/local/sbin/buddy-paperless-backup.sh
```

```bash
tail -100 /var/backups/buddy-paperless/logs/backup-$(date +%F).log
source /etc/buddy-backup/restic.env && restic snapshots
```

---

## 8. Retention (Vorschlag)

| Regel | Bedeutung |
|-------|-----------|
| 7 daily | letzte Woche täglich |
| 4 weekly | ~1 Monat Wochenstände |
| 6 monthly | ~halbes Jahr |

Auf der Storage Box ideal **≥ 2–3×** Rohdatengröße frei (erstes Full ist groß).

---

## 9. Restore — Schritt für Schritt (neue Instanz)

### 9.1 Neue Maschine vorbereiten

```bash
# Docker + Compose, restic, openssh-client
# SSH-Key + /root/.ssh/config wie Abschnitt 3
# /etc/buddy-backup/restic-password + restic.env wiederherstellen
```

### 9.2 Snapshot wählen

```bash
source /etc/buddy-backup/restic.env
restic snapshots --tag buddy-paperless
```

### 9.3 Restore nach Staging

```bash
RESTORE=/var/backups/buddy-paperless/restore
rm -rf "$RESTORE"
mkdir -p "$RESTORE"
restic restore SNAPSHOT_ID --target "$RESTORE"
find "$RESTORE" -name MANIFEST.txt
```

### 9.4 Buddy wiederherstellen

```bash
sudo mkdir -p /opt/familybrain
cd /opt/familybrain
curl -fsSLO https://raw.githubusercontent.com/rolfwalker71-commits/familybrain/main/docker-compose.yml
cp /pfad/zum/restore/buddy/env .env
sudo rsync -a --delete /pfad/zum/restore/buddy/data/ ./data/
sudo chown -R 1000:1000 ./data
docker compose pull
docker compose up -d
# Embeddings/Qdrant: in Buddy Sync/Index neu aufbauen
```

### 9.5 Paperless wiederherstellen

```bash
cd /opt/paperless
cp /pfad/zum/restore/paperless/env .env
cp /pfad/zum/restore/paperless/docker-compose.yml .
sudo rsync -a --delete /pfad/zum/restore/paperless/media/   <MEDIA_VOLUME_PATH>/
sudo rsync -a --delete /pfad/zum/restore/paperless/pgdata/  <PGDATA_VOLUME_PATH>/
docker compose up -d
```

### 9.6 Nach dem Restore

1. Paperless: Login, PDF öffnen  
2. Buddy: Paperless-URL anpassen, Sync, Login  
3. Stichprobe Trip / Ledger / Dokument  
4. Qdrant/Chat-Suche: Index neu aufbauen  

---

## 10. Restore-Proof (regelmäßig)

Alle ~3 Monate: Snapshot auf Test-Maschine restoren, Checkliste:

```text
[ ] restic snapshots listet erwartete Tags
[ ] MANIFEST.txt Datum plausibel
[ ] Buddy UI + Login ok
[ ] SQLite/Dokumente nicht leer
[ ] Paperless PDF öffnet
[ ] «In Paperless öffnen» (URL ggf. anpassen)
```

---

## 11. Betriebs-Checkliste

| Aktion | Befehl / Ort |
|--------|----------------|
| Backup manuell | `sudo /usr/local/sbin/buddy-paperless-backup.sh` |
| Snapshots | `source /etc/buddy-backup/restic.env && restic snapshots` |
| SFTP-Test | `sftp storagebox` |
| Letztes Log | `ls -lt /var/backups/buddy-paperless/logs \| head` |
| Repo-Check | `restic check` (monatlich: `--read-data`) |

---

## 12. Geheimnisse & Sicherheit

| Geheimnis | Aufbewahrung |
|-----------|----------------|
| restic Repo-Passwort | `/etc/buddy-backup/restic-password` + Password-Manager |
| Storage-Box SSH-Key | `/root/.ssh/storagebox_ed25519` (600) |
| Buddy / Paperless `.env` | nur im Staging/Snapshot (durch restic verschlüsselt) |

Storage-Box-Zugang möglichst auf Server-IP beschränken.  
restic verschlüsselt den Repo-Inhalt — Box allein ohne Passwort reicht nicht.

---

## 13. Was absichtlich einfach bleibt

- **Ein** Repo per SFTP, Tag `buddy-paperless`, ein Tagesjob  
- Kein CIFS-Mount  
- Qdrant bewusst ausgelassen  
- Kein zweites PDF-Spiegeln in Buddy  

---

## 14. Pfad-Platzhalter

```text
BUDDY_DIR=           /opt/familybrain
PAPERLESS_DIR=       /opt/paperless
PAPERLESS_MEDIA=     (docker volume inspect …)
PAPERLESS_PGDATA=    (docker volume inspect …)
RESTIC_REPOSITORY=   sftp:storagebox:/home/restic-repo
SSH Host alias=      storagebox  (Port 23)
```

```bash
docker volume ls | grep -i paperless
docker volume inspect VOLUME_NAME -f '{{ .Mountpoint }}'
```

---

## 15. Kurz: Happy Path

1. SSH-Key + `Host storagebox` (Port **23**)  
2. `RESTIC_REPOSITORY=sftp:storagebox:/home/restic-repo` + `restic init`  
3. Skript-Pfade anpassen, einmal manuell laufen lassen  
4. Cron 03:15  
5. Quartalsweise Restore-Proof  
6. Ernstfall: Key + Passwort + `restic restore` + rsync + `compose up` (+ Qdrant neu indexieren)

**Worst Case abgedeckt:** neue Maschine + Docker + Restore = Stand der Sicherung (Buddy-Daten und Paperless-PDFs).
