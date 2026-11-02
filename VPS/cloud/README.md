# EdgeFolio Cloud (Option B)

Cloud attendance API: the Android app's "Cloud" mode talks to it, and the EDGE desktop pulls punches
from it. Full plan: [`/CLOUD_ATTENDANCE_PLAN.md`](../../CLOUD_ATTENDANCE_PLAN.md).

Plain Node 20 + Express + Mongoose, **no build step** (the shared VPS runs out of memory on builds).
Separate from the empty `VPS/src` skeleton, which belongs to an older, unbuilt design.

## Run locally

```bash
pnpm install
cp .env.example .env    # fill MONGO_URL, JWT_SECRET, PUBLIC_BASE_URL
pnpm start              # http://127.0.0.1:3090/health
pnpm test
```

## Deploy (shared VPS today)

| Item | Value |
|---|---|
| Path | `/root/projects/public-credit/edgefolio/VPS/cloud` (part of the existing repo checkout) |
| PM2 | `edgefolio-cloud`, from `deploy/ecosystem.config.cjs` (heap capped, restarts above 200 MB) |
| Port | 3090 on 127.0.0.1 only |
| Public URL | `https://edgefolio.iotsoft.in/cloud/` via `deploy/nginx-cloud-location.conf` |
| Database | `edgefolio_cloud` on the VPS MongoDB 4.4 |
| Secrets | `VPS/cloud/.env` on the server only (git-ignored) |

Update: `git pull` in the checkout → `pnpm install --prod` in `VPS/cloud` → `pm2 restart edgefolio-cloud`.

## Moving to another server later

Nothing in the code names an IP, host or path. Move = new server, same checkout, restore the latest
`edgefolio_cloud` backup, copy `.env` (new `MONGO_URL` if the DB moves), add the nginx location (or a
subdomain), switch DNS / `PUBLIC_BASE_URL`. Trigger: `/health` median response > 500 ms at the morning
peak, VPS memory > 80% for a week, or 200 active organisations (plan §10).
