#!/usr/bin/env bash
# Nightly backup of the edgefolio_cloud database (plan §7): mongodump → gzip → AES-256 (openssl,
# passphrase BACKUP_PASSPHRASE from VPS/cloud/.env) → BACKUP_DIR, 30 days kept, root-only files.
# Prints no secrets. Run by cron (deploy/install-backup-cron.sh) or by hand.
#
# Restore:
#   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in <file>.enc \
#     | mongorestore --uri "$MONGO_URL" --archive --gzip --drop
set -euo pipefail

CLOUD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$CLOUD_DIR/.env"
[ -f "$ENV_FILE" ] || { echo "$(date -Is) backup: $ENV_FILE missing" >&2; exit 1; }

# Missing optional keys must not abort the script (grep exits 1 on no match under pipefail).
getenv() { { grep -E "^$1=" "$ENV_FILE" || true; } | tail -1 | cut -d= -f2- | sed -E "s/^['\"](.*)['\"]$/\1/"; }
MONGO_URL="$(getenv MONGO_URL)"
BACKUP_PASSPHRASE="$(getenv BACKUP_PASSPHRASE)"
BACKUP_DIR="$(getenv BACKUP_DIR)"; BACKUP_DIR="${BACKUP_DIR:-/root/backups/edgefolio-cloud}"
KEEP_DAYS="$(getenv BACKUP_KEEP_DAYS)"; KEEP_DAYS="${KEEP_DAYS:-30}"
[ -n "$MONGO_URL" ] || { echo "$(date -Is) backup: MONGO_URL not set" >&2; exit 1; }
[ -n "$BACKUP_PASSPHRASE" ] || { echo "$(date -Is) backup: BACKUP_PASSPHRASE not set" >&2; exit 1; }

umask 077
mkdir -p "$BACKUP_DIR"
out="$BACKUP_DIR/edgefolio_cloud-$(date +%Y%m%d-%H%M).archive.gz.enc"
tmp="$out.partial"

export BACKUP_PASSPHRASE
mongodump --uri "$MONGO_URL" --archive --gzip --quiet \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$tmp"
mv "$tmp" "$out"
unset BACKUP_PASSPHRASE

find "$BACKUP_DIR" -maxdepth 1 -name 'edgefolio_cloud-*.archive.gz.enc' -mtime "+$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: $(basename "$out") $(du -h "$out" | cut -f1)"
