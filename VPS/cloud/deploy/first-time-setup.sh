#!/usr/bin/env bash
# One-time setup of EdgeFolio Cloud on a server that already has the repo checked out, Node 20,
# pnpm, PM2, nginx and MongoDB. Safe to re-run: every step checks before it changes anything.
# Prints no secrets.
#
#   bash VPS/cloud/deploy/first-time-setup.sh [nginx-site-file]
#
# After it runs, the DB password still has to be set in VPS/cloud/.env (MONGO_URL), see README.
set -euo pipefail

CLOUD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_FILE="${1:-/etc/nginx/sites-enabled/edgefolio}"
SNIPPET="$CLOUD_DIR/deploy/nginx-cloud-location.conf"

echo "== EdgeFolio Cloud first-time setup in $CLOUD_DIR"

# 1. Dependencies for this package only — the checkout sits inside a shared pnpm workspace,
#    and a workspace-wide install would touch the other projects.
( cd "$CLOUD_DIR" && pnpm install --ignore-workspace --prod --frozen-lockfile >/dev/null )
echo "   deps installed (express, mongoose)"

# 2. .env with a freshly generated JWT secret. Mongo password left as CHANGE_ME on purpose.
if [ ! -f "$CLOUD_DIR/.env" ]; then
  secret="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  sed -e "s#^JWT_SECRET=.*#JWT_SECRET=${secret}#" \
      -e "s#^MONGO_URL=.*#MONGO_URL=mongodb://edgefolio_cloud:CHANGE_ME@127.0.0.1:27017/edgefolio_cloud?authSource=edgefolio_cloud#" \
      "$CLOUD_DIR/.env.example" > "$CLOUD_DIR/.env"
  chmod 600 "$CLOUD_DIR/.env"
  unset secret
  echo "   .env created (JWT secret generated; set the Mongo password in MONGO_URL)"
else
  echo "   .env already exists — left unchanged"
fi

# 3. nginx: add `location /cloud/` to the site's first server block, test, reload; restore on failure.
if [ -f "$SITE_FILE" ]; then
  if grep -q "location /cloud/" "$SITE_FILE"; then
    echo "   nginx already has location /cloud/ — left unchanged"
  else
    backup="/root/nginx-$(basename "$SITE_FILE").bak.$(date +%Y%m%d-%H%M%S)"
    cp -L "$SITE_FILE" "$backup"
    tmp="$(mktemp)"
    awk -v snip="$SNIPPET" '
      { print }
      !done && /server_name[ \t]/ { print ""; while ((getline line < snip) > 0) print "    " line; done = 1 }
    ' "$backup" > "$tmp"
    cat "$tmp" > "$(readlink -f "$SITE_FILE")"
    rm -f "$tmp"
    if nginx -t >/dev/null 2>&1; then
      systemctl reload nginx
      echo "   nginx: location /cloud/ added and reloaded (backup: $backup)"
    else
      cat "$backup" > "$(readlink -f "$SITE_FILE")"
      echo "   nginx test FAILED — original config restored from $backup; nothing reloaded" >&2
      exit 1
    fi
  fi
else
  echo "   nginx site file $SITE_FILE not found — add deploy/nginx-cloud-location.conf by hand" >&2
fi

# 4. PM2 process.
if pm2 describe edgefolio-cloud >/dev/null 2>&1; then
  pm2 restart edgefolio-cloud --update-env >/dev/null
  echo "   pm2: edgefolio-cloud restarted"
else
  pm2 start "$CLOUD_DIR/deploy/ecosystem.config.cjs" >/dev/null
  echo "   pm2: edgefolio-cloud started"
fi
pm2 save >/dev/null
echo "== done. Check: curl -s http://127.0.0.1:3090/health"
