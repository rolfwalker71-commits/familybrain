# Sicherungs- und Restore-Konzept (restic + Hetzner Storage Box)

Restore-taugliches Backup für **Buddy (FamilyBrain)** und **Paperless-ngx** auf derselben VM.
Ziel: Neue VM aufsetzen → App/Compose pullen → Restore → Stand der Sicherung.

**Annahme:** Die Hetzner Storage Box wird als Netzlaufwerk auf die VM gemountet (CIFS/SMB oder SFTP/rclone). Restic schreibt in ein Repository **auf diesem Mount**.

---

## 1. Was wird gesichert?

| Bereich | Inhalt | Warum |
|---------|--------|--------|
| **Buddy `./data/`** | SQLite (+ WAL), Medien (Trips, Finanzen, Avatare, Icons, Guides), optional `qdrant/` | Kompletter App-Stand |
| **Buddy `.env`** | Admin-Login, Session-Secret, Ports, Image-Tag | Ohne `.env` startet die App nicht wie zuvor |
| **Buddy `docker-compose.yml`** | Optional (kommt auch aus dem Repo) | Pinnt exakte Compose-Version am Backup-Tag |
| **Paperless Volumes** | `media` (PDFs), DB (`pgdata` oder SQLite-`data`), `export` falls genutzt | Originaldokumente + Paperless-Metadaten |
| **Paperless `.env` + compose** | Secrets, URLs, Versionen | Stack wieder hochfahren |

**Nicht nötig im Backup:** Redis (Paperless Broker) — ephemeral.  
**Nicht in Buddy:** PDFs liegen nur in Paperless.

---

## 2. Architektur (einfach)

```text
┌──────────────── VM (Hetzner Cloud) ────────────────┐
│  /opt/familybrain/     Buddy compose + ./data      │
│  /opt/paperless/       Paperless compose + volumes │
│  /mnt/storagebox/      Hetzner Storage Box (mount) │
│       └── restic-repo/     restic repository       │
│  /usr/local/sbin/      backup + restore scripts    │
└────────────────────────────────────────────────────┘
```

**Ein restic-Repo**, zwei Pfad-Präfixe im Snapshot (oder ein gemeinsames Staging-Verzeichnis vor dem `backup`).

Empfohlenes Staging (klare Restore-Struktur):

```text
/var/backups/buddy-paperless/staging/
  buddy/
    data/          # Kopie bzw. rsync von /opt/familybrain/data
    env            # Kopie von .env (Dateiname ohne Dot → weniger versteckt)
    docker-compose.yml
  paperless/
    media/
    pgdata/        # oder data/ bei SQLite-Install
    env
    docker-compose.yml
  MANIFEST.txt     # Timestamp, Host, Image-Tags, Disk-Usage
```

Restic sichert **nur** dieses Staging (oder direkt die Quellpfade mit Tags). Staging macht Restores und Tests einfacher.

---

## 3. Storage Box mounten

### 3.1 Voraussetzungen (Hetzner Robot / Cloud Console)

- Storage Box angelegt (z. B. BX11+)
- Benutzer + Passwort bzw. SSH-Key
- Optional: Unterverzeichnis `restic` / `backups` in der Box anlegen

### 3.2 Mount-Punkt

```bash
sudo mkdir -p /mnt/storagebox
```

### 3.3 Variante A — CIFS/SMB (einfach, üblich)

In `/etc/fstab` (Werte anpassen):

```fstab
//u123456.your-storagebox.de/backup  /mnt/storagebox  cifs  credentials=/root/.smbcredentials-storagebox,uid=0,gid=0,iocharset=utf8,file_mode=0600,dir_mode=0700,_netdev,x-systemd.automount  0  0
```

`/root/.smbcredentials-storagebox`:

```text
username=u123456
password=GEHEIM
```

```bash
sudo chmod 600 /root/.smbcredentials-storagebox
sudo mount -a
df -h /mnt/storagebox
```

### 3.4 Variante B — restic direkt per SFTP (ohne Dauer-Mount)

Wenn du **nicht** mounten willst:

```bash
export RESTIC_REPOSITORY="sftp:u123456@u123456.your-storagebox.de:/home/restic-repo"
```

Dieses Dokument geht von **gemounteter Box** aus (`/mnt/storagebox/restic-repo`).

### 3.5 Repo-Verzeichnis

```bash
sudo mkdir -p /mnt/storagebox/restic-repo
sudo mkdir -p /var/backups/buddy-paperless/{staging,logs}
```

---

## 4. restic einrichten (einmalig)

### 4.1 Install

```bash
# Debian/Ubuntu
sudo apt update && sudo apt install -y restic
restic version
```

### 4.2 Passwort-Datei (nie ins Git)

```bash
sudo mkdir -p /etc/buddy-backup
openssl rand -base64 32 | sudo tee /etc/buddy-backup/restic-password >/dev/null
sudo chmod 600 /etc/buddy-backup/restic-password
```

**Wichtig:** Dieses Passwort zusätzlich offline notieren (Password-Manager). Ohne es ist das Repo wertlos.

### 4.3 Environment-Datei

`/etc/buddy-backup/restic.env`:

```bash
export RESTIC_REPOSITORY="/mnt/storagebox/restic-repo"
export RESTIC_PASSWORD_FILE="/etc/buddy-backup/restic-password"
# Optional: schnellere Uploads
export RESTIC_PACK_SIZE=32
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

---

## 5. Konsistenzregeln (Restore-Proof)

| Stack | Vor dem Kopieren | Warum |
|-------|------------------|--------|
| **Buddy** | `docker compose stop familybrain` (Qdrant darf laufen) **oder** `sqlite3 … 'PRAGMA wal_checkpoint(TRUNCATE);'` | WAL nicht halb geschrieben |
| **Paperless** | `docker compose stop` (oder zumindest `webserver` + DB kurz stoppen) | Medien + DB konsistent |
| **Danach** | Staging → `restic backup` → Services wieder `up -d` | Downtime klein halten (Minuten) |

Kurze Nachtfenster sind ok. Kein „live `cp` der `.sqlite`“ ohne Checkpoint.

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

exec > >(tee -a "$LOG") 2>&1
echo "=== backup start $(date -Is) ==="

# Mount prüfen
if ! mountpoint -q /mnt/storagebox; then
  echo "ERROR: Storage Box nicht gemountet"
  exit 1
fi

rm -rf "$STAGING"
mkdir -p "$STAGING"/{buddy,paperless}

# --- Buddy konsistent ---
cd "$BUDDY_DIR"
docker compose stop familybrain
mkdir -p "$STAGING/buddy/data"
rsync -a --delete ./data/ "$STAGING/buddy/data/"
cp -a .env "$STAGING/buddy/env"
cp -a docker-compose.yml "$STAGING/buddy/docker-compose.yml" || true
docker compose start familybrain

# --- Paperless konsistent ---
cd "$PAPERLESS_DIR"
docker compose stop
mkdir -p "$STAGING/paperless"/{media,pgdata}
rsync -a --delete "$PAPERLESS_MEDIA"/ "$STAGING/paperless/media/"
rsync -a --delete "$PAPERLESS_PGDATA"/ "$STAGING/paperless/pgdata/"
cp -a .env "$STAGING/paperless/env"
cp -a docker-compose.yml "$STAGING/paperless/docker-compose.yml" || true
docker compose up -d

# Manifest
{
  echo "host=$(hostname)"
  echo "time=$(date -Is)"
  echo "buddy_image=$(cd "$BUDDY_DIR" && docker compose images -q familybrain 2>/dev/null | head -1)"
  du -sh "$STAGING"/*/*
} > "$STAGING/MANIFEST.txt"

# --- restic ---
restic backup "$STAGING" \
  --tag buddy-paperless \
  --tag "host:$(hostname)" \
  --exclude '**/qdrant/raft_state*' || true

restic forget --tag buddy-paperless \
  --keep-daily 7 \
  --keep-weekly 4 \
  --keep-monthly 6 \
  --prune

restic check --read-data-subset=5%

echo "=== backup done $(date -Is) ==="
```

```bash
sudo chmod 750 /usr/local/sbin/buddy-paperless-backup.sh
```

**Pfade anpassen:** Volume-Namen mit `docker volume ls` und `docker volume inspect …` ermitteln.

### Optional: Qdrant weglassen

In `rsync` für Buddy `--exclude qdrant/` setzen. Embeddings lassen sich neu aufbauen; Backup wird kleiner/schneller.

---

## 7. Zeitsteuerung (cron)

```bash
sudo crontab -e
```

```cron
# Täglich 03:15 — Storage Box muss gemountet sein
15 3 * * * /usr/local/sbin/buddy-paperless-backup.sh
```

Nach dem ersten Lauf Log prüfen:

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

Auf der Storage Box sollte **≥ 2–3×** die Rohdatengröße frei sein (Dedup hilft, aber erstes Full ist groß).

---

## 9. Restore — Schritt für Schritt (neue VM)

### 9.1 Neue VM vorbereiten

```bash
# Docker + Compose installieren
# Storage Box mounten (wie Abschnitt 3)
# restic installieren
# Passwort-Datei wiederherstellen → /etc/buddy-backup/restic-password
# restic.env wie auf der alten VM
```

### 9.2 Snapshot wählen

```bash
source /etc/buddy-backup/restic.env
restic snapshots --tag buddy-paperless
# Notiere Snapshot-ID, z.B. a1b2c3d4
```

### 9.3 Restore nach Staging

```bash
RESTORE=/var/backups/buddy-paperless/restore
rm -rf "$RESTORE"
mkdir -p "$RESTORE"
restic restore a1b2c3d4 --target "$RESTORE"
ls -la "$RESTORE"/*/   # erwartet buddy/ + paperless/ + MANIFEST.txt
cat "$RESTORE"/*/MANIFEST.txt 2>/dev/null || cat "$RESTORE/MANIFEST.txt"
```

(Je nach Backup-Wurzel liegt der Inhalt unter `$RESTORE/var/backups/.../staging/` — mit `find "$RESTORE" -name MANIFEST.txt` finden.)

### 9.4 Buddy wiederherstellen

```bash
sudo mkdir -p /opt/familybrain
cd /opt/familybrain
# compose aus Repo ODER aus Backup
curl -fsSLO https://raw.githubusercontent.com/rolfwalker71-commits/familybrain/main/docker-compose.yml
cp /pfad/zum/restore/buddy/env .env
sudo rsync -a --delete /pfad/zum/restore/buddy/data/ ./data/
sudo chown -R 1000:1000 ./data   # falls Image als UID 1000 läuft
docker compose pull
docker compose up -d
docker compose ps
curl -sI http://127.0.0.1:3100 | head -5
```

### 9.5 Paperless wiederherstellen

```bash
sudo mkdir -p /opt/paperless
cd /opt/paperless
# compose + .env aus Backup
cp /pfad/zum/restore/paperless/env .env
cp /pfad/zum/restore/paperless/docker-compose.yml .
# Volumes anlegen / mounten, dann:
sudo rsync -a --delete /pfad/zum/restore/paperless/media/   <MEDIA_VOLUME_PATH>/
sudo rsync -a --delete /pfad/zum/restore/paperless/pgdata/  <PGDATA_VOLUME_PATH>/
docker compose up -d
docker compose logs --tail 100 webserver
```

### 9.6 Nach dem Restore

1. Paperless-Web UI: Login, ein PDF öffnen  
2. Buddy: Einstellungen → Paperless-URL (Hostname der neuen VM / Proxy)  
3. Buddy: Sync anstoßen, Login mit `.env`-Credentials  
4. Stichprobe: Trip, Finanz-Ledger, ein analysiertes Dokument  

---

## 10. Restore-Proof (regelmäßig testen)

**Alle 3 Monate** (oder nach großem Update):

1. Separate Test-VM oder zweites Verzeichnis  
2. Einen Snapshot restoren (nicht Production überschreiben)  
3. Buddy + Paperless kurz starten  
4. Checkliste abhaken:

```text
[ ] restic snapshots listet erwartete Tags
[ ] MANIFEST.txt Datum plausibel
[ ] Buddy UI erreichbar, Login ok
[ ] SQLite vorhanden, Dokumentliste nicht leer
[ ] Paperless UI erreichbar, PDF öffnet
[ ] Buddy → «In Paperless öffnen» funktioniert (URL ggf. anpassen)
```

Ohne bestandenen Proof gilt das Backup als **unbewiesen**.

---

## 11. Betriebs-Checkliste (Alltag)

| Aktion | Befehl / Ort |
|--------|----------------|
| Backup manuell | `sudo /usr/local/sbin/buddy-paperless-backup.sh` |
| Snapshots | `source /etc/buddy-backup/restic.env && restic snapshots` |
| Letztes Log | `ls -lt /var/backups/buddy-paperless/logs \| head` |
| Mount ok? | `mountpoint /mnt/storagebox && df -h /mnt/storagebox` |
| Repo-Integrität | `restic check` (monatlich voll: `--read-data`) |

---

## 12. Geheimnisse & Sicherheit

| Geheimnis | Aufbewahrung |
|-----------|----------------|
| restic Repo-Passwort | `/etc/buddy-backup/restic-password` **und** Password-Manager |
| Storage-Box Zugangsdaten | `/root/.smbcredentials-storagebox` (600) |
| Buddy `.env` | Nur im Staging/Snapshot (verschlüsselt durch restic) |
| Paperless `.env` | wie Buddy |

Storage Box-Traffic idealerweise nur vom Server-IP freigeben (falls Box das unterstützt).  
restic verschlüsselt den Repo-Inhalt — ein Diebstahl der Box allein reicht ohne Passwort nicht.

---

## 13. Was absichtlich einfach bleibt

- **Ein** Repo, **ein** Tag `buddy-paperless`, **ein** Tagesjob  
- Kein zweites Backup-Format in der App nötig für DR (In-App-Backup kann später ergänzen)  
- Kein Spiegeln aller PDFs in Buddy  
- Qdrant optional ausschließbar  

---

## 14. Pfad-Platzhalter (vor dem ersten Lauf ausfüllen)

```text
BUDDY_DIR=           /opt/familybrain
PAPERLESS_DIR=       /opt/paperless
PAPERLESS_MEDIA=     (docker volume inspect …)
PAPERLESS_PGDATA=    (docker volume inspect …)
STORAGEBOX_MOUNT=    /mnt/storagebox
RESTIC_REPO=         /mnt/storagebox/restic-repo
```

Volume-Pfade ermitteln:

```bash
docker volume ls | grep -i paperless
docker volume inspect VOLUME_NAME -f '{{ .Mountpoint }}'
```

---

## 15. Kurz: Happy Path

1. Storage Box mounten → `/mnt/storagebox`  
2. `restic init` mit Passwort-Datei  
3. Skript-Pfade anpassen, einmal manuell laufen lassen  
4. Cron 03:15  
5. Quartalsweise Restore-Proof auf Test-VM  
6. Im Ernstfall: Mount + Passwort + `restic restore` + rsync nach `/opt/...` + `compose up`

Damit ist der Worst Case abgedeckt: **neue VM + Docker + Restore = Stand der Sicherung** (Buddy-Logik *und* Paperless-PDFs).
