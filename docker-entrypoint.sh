#!/bin/sh
set -e

# Host-mounted ./data often belongs to root or a different uid than
# the container's `node` user (uid 1000). Ensure the DB directory is writable.
mkdir -p /app/data
if [ "$(id -u)" = "0" ]; then
  chown -R node:node /app/data || true
  if command -v runuser >/dev/null 2>&1; then
    exec runuser -u node -- env HOME=/home/node npm run start
  fi
  exec su -s /bin/sh node -c 'cd /app && exec npm run start'
fi

exec npm run start
