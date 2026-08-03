# Sicherungs- und Restore-Konzept (restic + Hetzner Storage Box)

Restore-taugliches Backup für **Buddy (FamilyBrain)** und **Paperless-ngx** (typisch Proxmox-LXC/VM, oft **lokal zu Hause**).
Ziel: Neue Instanz aufsetzen → App/Compose pullen → Restore → Stand der Sicherung.

### Welcher Weg?

| Test vom Proxmox-Host / LXC | Empfehlung |
|-----------------------------|------------|
| `nc -vz u….your-storagebox.de 23` → **open**, Port **445** hängt/timeout | **SFTP (Port 23)** — Standard hier ([Abschnitt 3](#3-storage-box-per-sftp-empfohlen-wenn-port-445-blockiert-ist)) |
| Port **445** erreichbar + SMB in Robot aktiv | optional CIFS ([Abschnitt 3-CIFS](#3-cifs-optional-nur-wenn-port-445-geht)) |

Viele Heim-Provider blockieren ausgehendes **SMB (445)**. Hetzner Storage Box SFTP läuft auf **Port 23** und funktioniert dann trotzdem. Proxmox-Datastore „SMB/CIFS“ braucht 445 — ohne 445 bleibt er `inactive`; das ist dann **kein** Konfigurationsfehler in der UI, sondern Netzwerk.

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

## 2. Architektur (SFTP — empfohlen)

```text
┌────────── Proxmox lokal (Heimnetz) ───────────┐
│  LXC paperlessngx / Buddy                     │
│  /home/familybrain/familybrain/  Buddy+data   │
│  /data/paperless/                Paperless    │
│  /var/backups/.../               Staging      │
│  /etc/buddy-backup/              restic.env   │
│  restic ──SFTP :23──► Hetzner Storage Box     │
└───────────────────────────────────────────────┘
                    │
                    ▼
┌──────── Hetzner Storage Box ──────────────────┐
│  /home/paperlessngxrolf/   (verschlüsseltes restic-Repo)  │
└───────────────────────────────────────────────┘
```

Kein CIFS-Mount, kein LXC-Bind, kein Proxmox-SMB-Datastore nötig für restic.

```text
/var/backups/buddy-paperless/staging/
  buddy/
    data/              # ohne qdrant/
    env
    docker-compose.yml
  paperless/
    media/             # /data/paperless/media (PDFs)
    pgdata/            # postgresql
    data/              # paperless data/
    paperless-ai/      # optional: Docker-Volume paperless-ai
    docker-compose.yml
  MANIFEST.txt
```

---

## 3. Storage Box per SFTP (empfohlen, wenn Port 445 blockiert ist)

### 3.0 Kurzcheck

```bash
# auf pve01 oder im LXC
nc -vz u644393.your-storagebox.de 445   # oft: hängt / timeout
nc -vz u644393.your-storagebox.de 23    # muss: open
```

**Firewall:** Proxmox ist Client — an deinem Router nichts „öffnen“.  
Bei Hetzner Robot (Storage Box): falls IP-Filter aktiv → deine öffentliche Heim-IP freigeben (`curl -4 -s ifconfig.me`). Für SFTP reicht Port 23 erreichbar.

Proxmox-UI „SMB/CIFS“ mit Share `backup` / Subdir `/mnt/backup` kannst du für restic **ignorieren** (braucht 445). Optional später löschen oder nur nutzen, wenn 445 irgendwann geht.

### 3.1 SSH-Key (im LXC `paperlessngx` — erledigt / Referenz)

Auf diesem Setup: Key-Auth ohne Passwort funktioniert (`sftp storagebox`).

```bash
mkdir -p /root/.ssh && chmod 700 /root/.ssh
ssh-keygen -t ed25519 -f /root/.ssh/id_ed25519_storagebox -N "" -C "buddy-restic-lxc"
```

**Key hinterlegen — nicht die Robot-/Console-UI pasten** (meldet oft „SSH key ist ungültig“). Stattdessen:

```bash
# Storage-Box-Passwort aus Hetzner (nicht das restic-Passwort!)
cat /root/.ssh/id_ed25519_storagebox.pub | \
  ssh -p23 u644393@u644393.your-storagebox.de install-ssh-key
```

Erwartung: `installed in OpenSSH format` (Port 23). SSH-Support in den Box-Einstellungen muss aktiv sein.

```bash
cat > /root/.ssh/config <<'EOF'
Host storagebox
  HostName u644393.your-storagebox.de
  User u644393
  Port 23
  IdentityFile /root/.ssh/id_ed25519_storagebox
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
EOF
chmod 600 /root/.ssh/config
```

**Fallen:**
- `IdentityFile` = **privater** Key (`id_ed25519_storagebox`), nie die `.pub`
- Dateiname exakt `…_storagebox` (Tippfehler `sotragebox` → „not accessible“)

```bash
sftp storagebox
# bei Erfolg:
mkdir paperlessngxrolf
pwd
ls
bye
```

Explizit ohne Config-Alias:

```bash
sftp -P 23 -i /root/.ssh/id_ed25519_storagebox u644393@u644393.your-storagebox.de
```

### 3.2 restic.env

```bash
sudo mkdir -p /etc/buddy-backup
openssl rand -base64 32 | sudo tee /etc/buddy-backup/restic-password >/dev/null
sudo chmod 600 /etc/buddy-backup/restic-password

sudo tee /etc/buddy-backup/restic.env >/dev/null <<'EOF'
export RESTIC_REPOSITORY="sftp:storagebox:paperlessngxrolf"
export RESTIC_PASSWORD_FILE="/etc/buddy-backup/restic-password"
export RESTIC_PACK_SIZE=32
EOF
sudo chmod 600 /etc/buddy-backup/restic.env
```

Hetzner: nur unter `/home` schreibbar — relativer Pfad `paperlessngxrolf` = `/home/paperlessngxrolf`. Absolute Form `sftp:storagebox:/home/paperlessngxrolf` geht oft auch; bei Fehlern relative Variante nutzen.

```bash
source /etc/buddy-backup/restic.env
restic init
restic snapshots
sudo mkdir -p /var/backups/buddy-paperless/{staging,logs}
```

Weiter mit Abschnitt 4–7 (Konsistenz, Backup-Skript, Cron). Im Skript muss `RESTIC_REPOSITORY` mit `sftp:` beginnen; den CIFS-`mountpoint`-Check kannst du weglassen bzw. überspringen, wenn nur SFTP genutzt wird.

---

## 3-CIFS. Optional — nur wenn Port 445 geht

Nur relevant, wenn `nc … 445` und `smbclient -L` vom Host klappen. Sonst diesen Abschnitt überspringen.

Proxmox-Dialog (Heimnetz → Hetzner):

| Feld | Wert |
|------|------|
| Server | `u644393.your-storagebox.de` |
| Username | `u644393` |
| Share | oft **`u644393`** (nicht `backup`) — per `smbclient -L` prüfen |
| Subdirectory | **leer** lassen (nicht `/mnt/backup`) |
| Content | Backup |

Dann Host-Mount `/mnt/pve/Hetzner-Storagebox` → bei LXC per `mp0` binden (früher Abschnitt 3.B). Details: CIFS-fstab nur in **voller VM**; in LXC kein `mount.cifs` (`Operation not permitted`).

---

## 4. restic — Kurz (nach Abschnitt 3)

Abschnitt 3 enthält bereits: SSH-Key, `restic.env` (SFTP), `restic init`, Staging-Verzeichnisse.

Falls noch nicht installiert:

```bash
sudo apt update && sudo apt install -y restic openssh-client
source /etc/buddy-backup/restic.env
restic snapshots
```

**Repo-Passwort** offline im Password-Manager notieren.

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

Pfade für LXC `paperlessngx` (Paperless unter `/data/paperless`, **keine** `.env` — Secrets in `docker-compose.yml`; Redis ephemeral → nicht sichern):

```bash
#!/usr/bin/env bash
set -euo pipefail

source /etc/buddy-backup/restic.env

STAGING=/var/backups/buddy-paperless/staging
LOG=/var/backups/buddy-paperless/logs/backup-$(date +%F).log

# Buddy: Ordner mit docker-compose.yml + data/ (Status-UI → data/backup-status.json)
BUDDY_DIR=/home/familybrain/familybrain

# Paperless (LXC paperlessngx)
PAPERLESS_DIR=/data/paperless
# PDFs / Originaldokumente (Host-Bind; siehe ls /data/paperless/media)
PAPERLESS_MEDIA=/data/paperless/media
# Postgres-Datenverzeichnis
PAPERLESS_PGDATA=/data/paperless/postgresql/_data
# Paperless Anwendungsdaten
PAPERLESS_DATA=/data/paperless/data
# paperless-ai Docker-Volume (nicht mit MEDIA verwechseln!)
# Pfad prüfen: docker volume inspect paperless_paperless-ai_data -f '{{.Mountpoint}}'
PAPERLESS_AI=/var/lib/docker/volumes/paperless_paperless-ai_data/_data

mkdir -p "$(dirname "$LOG")"
exec > >(tee -a "$LOG") 2>&1
echo "=== backup start $(date -Is) ==="

case "${RESTIC_REPOSITORY:-}" in
  sftp:*|sftp://*)
    echo "OK: SFTP-Repository $RESTIC_REPOSITORY"
    ;;
  *)
    echo "ERROR: RESTIC_REPOSITORY muss sftp:… sein (siehe docs/backup-restic.md Abschnitt 3)"
    exit 1
    ;;
esac

if ! restic cat config >/dev/null 2>&1; then
  echo "ERROR: restic erreicht das Repo nicht (SSH-Key Port 23, Pfad, Passwort?)"
  echo "Test: sftp storagebox && source /etc/buddy-backup/restic.env && restic snapshots"
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
    echo "INFO: keine .env in $(pwd) — Config vermutlich in docker-compose.yml"
  fi
}

rm -rf "$STAGING"
mkdir -p "$STAGING"/{buddy,paperless}

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

paperless_up() {
  (cd "$PAPERLESS_DIR" && docker compose up -d) || true
}
(
  set -euo pipefail
  cd "$PAPERLESS_DIR"
  docker compose stop
  trap paperless_up EXIT
  mkdir -p "$STAGING/paperless"/{media,pgdata,data,paperless-ai}
  rsync -a --delete "$PAPERLESS_MEDIA"/ "$STAGING/paperless/media/"
  rsync -a --delete "$PAPERLESS_PGDATA"/ "$STAGING/paperless/pgdata/"
  rsync -a --delete "$PAPERLESS_DATA"/ "$STAGING/paperless/data/"
  if [[ -d "$PAPERLESS_AI" ]]; then
    rsync -a --delete "$PAPERLESS_AI"/ "$STAGING/paperless/paperless-ai/"
  else
    echo "WARN: PAPERLESS_AI fehlt ($PAPERLESS_AI) — docker volume inspect prüfen"
  fi
  copy_env_file "$STAGING/paperless/env"
  cp -a docker-compose.yml "$STAGING/paperless/docker-compose.yml"
  cp -a backup_complete.sh "$STAGING/paperless/backup_complete.sh" 2>/dev/null || true
  trap - EXIT
  paperless_up
)

{
  echo "host=$(hostname)"
  echo "time=$(date -Is)"
  echo "repo=${RESTIC_REPOSITORY}"
  echo "qdrant=excluded"
  echo "paperless_redis=excluded"
  du -sh "$STAGING"/*/* 2>/dev/null || true
} > "$STAGING/MANIFEST.txt"

STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
STARTED_EPOCH="$(date +%s)"
BACKUP_JSON="$(mktemp)"
BACKUP_OK=1
CHECK_OK=1

set +e
restic backup "$STAGING" \
  --tag buddy-paperless \
  --tag "host:$(hostname)" \
  --exclude '**/qdrant/**' \
  --json >"$BACKUP_JSON"
BACKUP_RC=$?
set -e
if [[ "$BACKUP_RC" -ne 0 ]]; then
  BACKUP_OK=0
  echo "ERROR: restic backup exit $BACKUP_RC"
fi

set +e
restic forget --tag buddy-paperless \
  --keep-daily 7 \
  --keep-weekly 4 \
  --keep-monthly 6 \
  --prune
FORGET_RC=$?
restic check --read-data-subset=5%
CHECK_RC=$?
set -e
[[ "$FORGET_RC" -eq 0 ]] || BACKUP_OK=0
[[ "$CHECK_RC" -eq 0 ]] || CHECK_OK=0

FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
FINISHED_EPOCH="$(date +%s)"
DURATION="$((FINISHED_EPOCH - STARTED_EPOCH))"
LOG_TAIL_FILE="$(mktemp)"
tail -n 80 "$LOG" >"$LOG_TAIL_FILE" 2>/dev/null || true

STATUS_FILE="${BUDDY_BACKUP_STATUS_FILE:-$BUDDY_DIR/data/backup-status.json}"
if [[ -d "$(dirname "$STATUS_FILE")" ]]; then
  export STATUS_FILE STARTED_AT FINISHED_AT DURATION RESTIC_REPOSITORY
  export BACKUP_JSON BACKUP_OK CHECK_OK LOG_TAIL_FILE
  python3 - <<'PY'
import json, os, pathlib
from datetime import datetime, timezone

status_path = pathlib.Path(os.environ["STATUS_FILE"])
backup_json = pathlib.Path(os.environ["BACKUP_JSON"])
started = os.environ["STARTED_AT"]
finished = os.environ["FINISHED_AT"]
duration = int(os.environ["DURATION"])
repo = os.environ.get("RESTIC_REPOSITORY") or ""
backup_ok = os.environ.get("BACKUP_OK") == "1"
check_ok = os.environ.get("CHECK_OK") == "1"
log_tail_path = pathlib.Path(os.environ.get("LOG_TAIL_FILE") or "")
log_tail = log_tail_path.read_text(errors="replace") if log_tail_path.exists() else ""

summary_msg = {}
if backup_json.exists():
    for line in backup_json.read_text(errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if obj.get("message_type") == "summary":
            summary_msg = obj

files_new = summary_msg.get("files_new")
files_changed = summary_msg.get("files_changed")
files_unmodified = summary_msg.get("files_unmodified")
data_added = summary_msg.get("data_added")
data_added_packed = summary_msg.get("data_added_packed")
total_bytes = summary_msg.get("total_bytes_processed")
snapshot_id = summary_msg.get("snapshot_id")

ok = backup_ok and check_ok
summary = (
    "restic backup + check ok (qdrant excluded)"
    if ok
    else "restic backup/check fehlgeschlagen — Log prüfen"
)

def load_prev():
    if not status_path.exists():
        return {}
    try:
        return json.loads(status_path.read_text())
    except Exception:
        return {}

prev = load_prev()
recent = prev.get("recentActions") if isinstance(prev.get("recentActions"), list) else []

def push(action):
    recent.insert(0, action)
    del recent[20:]

now = finished
push({
    "at": now,
    "kind": "backup",
    "ok": backup_ok,
    "summary": summary if backup_ok else "restic backup fehlgeschlagen",
    "startedAt": started,
    "finishedAt": finished,
    "durationSeconds": duration,
    "snapshotId": snapshot_id,
    "filesNew": files_new,
    "filesChanged": files_changed,
    "filesUnmodified": files_unmodified,
    "dataAdded": data_added,
    "dataAddedPacked": data_added_packed,
    "totalBytesProcessed": total_bytes,
    "logTail": log_tail[-4000:] if log_tail else None,
})
push({
    "at": now,
    "kind": "check",
    "ok": check_ok,
    "summary": "restic check ok" if check_ok else "restic check fehlgeschlagen",
    "startedAt": started,
    "finishedAt": finished,
    "durationSeconds": None,
})

payload = {
    "lastSnapshotAt": finished if backup_ok else prev.get("lastSnapshotAt"),
    "lastCheckAt": finished,
    "lastCheckOk": check_ok,
    "restoreProofAt": prev.get("restoreProofAt"),
    "repository": repo,
    "summary": summary,
    "startedAt": started,
    "finishedAt": finished,
    "durationSeconds": duration,
    "snapshotId": snapshot_id,
    "filesNew": files_new,
    "filesChanged": files_changed,
    "filesUnmodified": files_unmodified,
    "dataAdded": data_added,
    "dataAddedPacked": data_added_packed,
    "totalBytesProcessed": total_bytes,
    "logTail": log_tail[-8000:] if log_tail else None,
    "recentActions": recent[:20],
    "notes": [
        f"geschrieben {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}",
        "paperless: media+postgresql+data+paperless-ai; redis excluded; no .env (compose-only)",
    ],
}
status_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
print(f"OK: status → {status_path}")
print(
    f"stats: added={data_added} packed={data_added_packed} "
    f"processed={total_bytes} files_new={files_new} snapshot={snapshot_id}"
)
PY
  rm -f "$BACKUP_JSON" "$LOG_TAIL_FILE"
fi

echo "=== backup done $(date -Is) duration=${DURATION}s ==="
```

```bash
chmod 750 /usr/local/sbin/buddy-paperless-backup.sh
```

**Hinweis:** Pfade oben = Produktiv-LXC. `PAPERLESS_MEDIA` = **Dokumente** (`/data/paperless/media`). Das Docker-Volume `paperless_paperless-ai_data` ist **paperless-ai**, nicht Media — liegt unter `PAPERLESS_AI`.  
`PAPERLESS_PGDATA`: falls Restore/rsync meckert, ohne `/_data` testen (`ls /data/paperless/postgresql`).  
Status-UI: `$BUDDY_DIR/data/backup-status.json`.

---

## 7. Zeitsteuerung (cron)

```cron
15 3 * * * /usr/local/sbin/buddy-paperless-backup.sh
```

---

## 8. Retention

7 daily · 4 weekly · 6 monthly. Box ideal ≥ 2–3× Rohdatengröße frei.

---

## 9. Restore

Ziel: Nach Verlust/Neuaufbau wieder denselben Stand wie im gewählten Snapshot.

### 9.1 Voraussetzungen auf der Zielmaschine

- restic + SSH-Key (`id_ed25519_storagebox`) + `~/.ssh/config` Host `storagebox` (Port 23)
- `/etc/buddy-backup/restic.env` mit **demselben** Repo und Passwort wie beim Backup:

```bash
# /etc/buddy-backup/restic.env
export RESTIC_REPOSITORY="sftp:storagebox:paperlessngxrolf"   # = /home/paperlessngxrolf
export RESTIC_PASSWORD_FILE="/etc/buddy-backup/restic-password"
```

- Docker + Compose; Buddy- und Paperless-Verzeichnisse angelegt

```bash
source /etc/buddy-backup/restic.env
restic snapshots --tag buddy-paperless
# ID merken, z. B. a1b2c3d4
```

### 9.2 Snapshot nach Staging holen

```bash
RESTORE=/var/backups/buddy-paperless/restore
rm -rf "$RESTORE"
mkdir -p "$RESTORE"
restic restore a1b2c3d4 --target "$RESTORE"
# oder: restic restore latest --target "$RESTORE" --tag buddy-paperless

ls -la "$RESTORE"/*/   # erwartet u. a. …/buddy/ …/paperless/ …/MANIFEST.txt
# Je nach Snapshot-Struktur oft:
#   $RESTORE/var/backups/buddy-paperless/staging/{buddy,paperless,MANIFEST.txt}
ST="$RESTORE/var/backups/buddy-paperless/staging"
# falls flacher: ST="$RESTORE" bzw. per find suchen:
# find "$RESTORE" -type d -name buddy | head
```

### 9.3 Buddy zurückspielen

Services stoppen, Daten ersetzen, starten:

```bash
BUDDY_DIR=/home/familybrain/familybrain
cd "$BUDDY_DIR"
docker compose stop familybrain

# Vorsicht: überschreibt lokales data/
rsync -a --delete "$ST/buddy/data/" "$BUDDY_DIR/data/"
# Compose/Env nur wenn gewünscht:
# cp -a "$ST/buddy/docker-compose.yml" "$BUDDY_DIR/"
# [[ -f $ST/buddy/env ]] && cp -a "$ST/buddy/env" "$BUDDY_DIR/.env"

docker compose up -d familybrain
# Qdrant-Index fehlt absichtlich → in Buddy neu indexieren / Embeddings neu aufbauen
```

### 9.4 Paperless zurückspielen (dein Layout)

```bash
PAPERLESS_DIR=/data/paperless
PAPERLESS_MEDIA=/data/paperless/media
PAPERLESS_PGDATA=/data/paperless/postgresql/_data
PAPERLESS_DATA=/data/paperless/data
PAPERLESS_AI=/var/lib/docker/volumes/paperless_paperless-ai_data/_data

cd "$PAPERLESS_DIR"
docker compose stop

rsync -a --delete "$ST/paperless/media/"  "$PAPERLESS_MEDIA/"
rsync -a --delete "$ST/paperless/pgdata/" "$PAPERLESS_PGDATA/"
rsync -a --delete "$ST/paperless/data/"   "$PAPERLESS_DATA/"
if [[ -d "$ST/paperless/paperless-ai" && -d "$PAPERLESS_AI" ]]; then
  rsync -a --delete "$ST/paperless/paperless-ai/" "$PAPERLESS_AI/"
fi
cp -a "$ST/paperless/docker-compose.yml" "$PAPERLESS_DIR/docker-compose.yml"
# keine .env — Secrets in der Compose-Datei

docker compose up -d
```

### 9.5 Verifikation

- Buddy: Login, Trips/Finanzen sichtbar
- Paperless: Dokumente öffnen, Suche
- Optional Restore-Nachweis: in `data/backup-status.json` `"restoreProofAt": "<ISO-UTC>"` setzen

### 9.6 Nur eine Datei / Stichprobe

```bash
mkdir -p /tmp/restic-probe
restic restore latest --target /tmp/restic-probe \
  --include '*/paperless/docker-compose.yml' \
  --include '*/buddy/data/familybrain.sqlite'
find /tmp/restic-probe -type f
rm -rf /tmp/restic-probe
```

**Nicht im Backup** → nach Restore neu: Redis (startet leer), Qdrant-Vektoren (neu indexieren).

---

## 10. Betriebs-Checkliste

| Aktion | Befehl |
|--------|--------|
| SFTP | `sftp storagebox` |
| Snapshots | `source /etc/buddy-backup/restic.env && restic snapshots` |
| Repo-Pfad | `sftp:storagebox:paperlessngxrolf` (= `/home/paperlessngxrolf`) |
| Backup manuell | `sudo /usr/local/sbin/buddy-paperless-backup.sh` |

---

## 11. Happy Path (dein Setup: lokal + Port 23)

| Schritt | Status |
|---------|--------|
| Port 445 tot, Port 23 open | erledigt |
| SSH-Key `id_ed25519_storagebox` + `install-ssh-key` | erledigt |
| `sftp storagebox` ohne Passwort | erledigt |
| `mkdir paperlessngxrolf` + `restic.env` + `restic init` | erledigt |
| Pfade ermitteln + Backup-Skript + erster Lauf | **jetzt** |
| Cron täglich | danach |
| Proxmox-SMB-Datastore | optional ignorieren (braucht 445) |

