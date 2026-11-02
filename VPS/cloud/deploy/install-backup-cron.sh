#!/usr/bin/env bash
# Adds the nightly EdgeFolio Cloud backup (02:30 server time) to root's crontab, and a
# BACKUP_PASSPHRASE to .env if it has none. Idempotent; prints no secrets.
set -euo pipefail

CLOUD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$CLOUD_DIR/.env"
LOG=/var/log/edgefolio-cloud-backup.log

if ! grep -qE '^BACKUP_PASSPHRASE=.+' "$ENV_FILE"; then
  pass="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
  sed -i '/^BACKUP_PASSPHRASE=/d' "$ENV_FILE"
  printf '\n# Encrypts nightly backups (deploy/backup.sh). Losing it = backups unreadable: keep a copy off this server.\nBACKUP_PASSPHRASE=%s\n' "$pass" >> "$ENV_FILE"
  unset pass
  echo "   BACKUP_PASSPHRASE generated in .env — copy it somewhere safe off this server"
else
  echo "   BACKUP_PASSPHRASE already set"
fi

line="30 2 * * * /bin/bash $CLOUD_DIR/deploy/backup.sh >> $LOG 2>&1"
if crontab -l 2>/dev/null | grep -qF "$CLOUD_DIR/deploy/backup.sh"; then
  echo "   cron already installed"
else
  ( crontab -l 2>/dev/null; echo "$line" ) | crontab -
  echo "   cron installed: 02:30 daily → $LOG"
fi
