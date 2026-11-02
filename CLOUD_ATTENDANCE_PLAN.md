# EdgeFolio Cloud Attendance (Option B) — Product & Build Plan

**As of:** 2026-11-02 · **Status:** planned, not started · **Shared doc:** https://claude.ai/artifact/RPWuHSFMm4TgGpPpTgMwrh
(this file is the repo copy so work can resume after a break; keep both in step)

---

## 1. Summary

EdgeFolio Cloud Attendance is a cloud-backed attendance product: employees mark attendance from the
phone app (or a U5 face machine) from anywhere, and the free EdgeFolio desktop (EDGE) on the office PC
pulls that attendance for salary, payroll and HR.

Launch = **free early access**, every feature included, to get people using it first.
**Nothing about pricing, plans or future charges appears anywhere users can see** (app, website,
onboarding, emails). Every organisation **registers on the IoT billing platform** so a monetisation
decision can be made later from real usage.

Build: turn the empty `VPS/src` backend into the cloud service, give the existing Android app a
"Cloud" mode beside "Office PC", and add a cloud pull to EDGE's existing Machine Import pipeline.
Rough size: ~14 weeks to public launch (section 9).

## 2. Where we start from

| Piece | Folder | State today | Role in Option B |
|---|---|---|---|
| EDGE desktop | `EDGE/` | Shipping, v1.0.7 live (v1.0.8 visitor auto-ID in test) | Stays free; payroll/salary/HR; pulls attendance from the cloud |
| Android app | `APK/mobile/` | Built + signed: face + liveness + GPS, offline queue, push, HR screens | Gains a "Cloud" mode; same screens |
| U5 machines + visitor auto-ID | `EDGE/backend/services/u5*` | Working on LAN | Optional input via EDGE |
| Cloud backend | `VPS/src/` | **Empty skeleton** (blank files) | Built by this plan |
| Billing/licensing | external repo `D:\IOT Device\Billing at IOT soft` (`EdgeLicense` model) | Live, shared by 16+ products | Organisation registration + usage record |
| Marketing site | `VPS/marketing/` | Live | Gains early-access sign-up |

Constraint today: the app is a client of the office PC (`ServerSetupPage.tsx`, key `edgefolio.baseUrl`);
away from office Wi-Fi it only queues punches. No iPhone app (needs a Mac to build).

## 3. Product definition

- **For:** Indian SMEs with staff outside one building (field teams, multiple sites, contractors,
  temporary labour); owners/HR who run EDGE for salary.
- **Cloud does:** phone attendance anywhere (face + liveness, GPS, optional geofence per office,
  offline queue to the cloud); live view for owners/HR (app + web dashboard); leave / missed-punch /
  visit requests; push alerts; machine punches beside phone punches.
- **Stays free on EDGE:** salary structures, payroll, PF/ESI/PT, slips, leave, cashbook, reports,
  local machines. EDGE keeps working offline; the cloud is one more attendance source.
- **Access during early access:** every feature free for every registered organisation, up to
  **50 active employees each** (raised on request, per organisation, on the billing record).

## 4. Launch: free early access

- Free for any registered organisation; no end date, plan or price mentioned anywhere.
- **Active organisation** = ≥3 employees marked attendance on ≥3 different days (internal metric).
- Internal goal (not public): 500 active organisations.
- Registration through the IoT billing platform: owner phone OTP, business name, city,
  GSTIN/Udyam when available. One organisation per owner phone; duplicates merged.
- Inactive 60 days → two reminders → cloud data archived (EDGE data never touched).
- Word of mouth: referral link per organisation (counted, to thank/feature referrers);
  "Early member" badge; WhatsApp-shareable monthly summary with "Made with EdgeFolio";
  early members' WhatsApp group; setup call if no punches 3 days after registering.
- Monetisation: not decided, not mentioned. Usage data on the billing platform informs it later.

## 5. Architecture

```
 Employee phone app ──punches──▶ ┌──────── EdgeFolio Cloud (shared VPS first) ────────┐
 Owner/HR app + web ──views────▶ │  App API /api/v1/apk/*   Database   Sync API      │──▶ IoT billing platform
 Website sign-up ───────────────────────────────────────────────────────────────────▶   (org registration,
                                 └──────────────────────────────────┬────────────────┘    plan, usage)
                                                                    │ EDGE calls OUT only
 U5 machines (LAN) ──▶ EDGE desktop (office PC, free) ◀─────────────┘ pulls punches, pushes employees
```

- The cloud serves the **same `/api/v1/apk/*` contract** the app already uses with EDGE → one app build,
  mode chosen at setup.
- EDGE only makes outbound calls → no fixed IP / port-forwarding at offices.

## 6. Cloud API and data model

**App endpoints (today in `EDGE/backend/routes/apk.js`) — owner in Cloud mode:**

| Group | Endpoints | Owner |
|---|---|---|
| Setup/login | `GET /config`, `GET /login-check`, `GET /offices`, `POST /auth/login`, `PATCH /fcm-token` | Cloud |
| Attendance | `POST /attendance`, `POST /attendance/checkout`, `POST /attendance/batch-sync`, `GET /today-status`, `GET /attendance-history`, `GET /attendance-calendar` | Cloud (EDGE pulls a copy) |
| Faces | `POST/GET /faces/self-enroll`, `GET /faces/:empId/embedding` | Cloud |
| HR/owner | `GET /live-feed`, `GET /analytics`, `GET/PATCH /employees`, work assignments, alert subscriptions, `POST /broadcast` | Cloud |
| Payroll views | `GET /payroll`, `GET /payroll/:runId`, `GET /payslips`, `GET /leave-balance` | EDGE (pushed to cloud after payroll run — later phase) |
| Profile | `GET/PATCH /profile` | Cloud, synced to EDGE |

**Sync contract with EDGE** (`/api/v1/sync/*`, org sync key stored in EDGE):
1. `PUT /sync/employees` — EDGE pushes the employee master. **EDGE owns the employee master.**
2. `GET /sync/punches?after=<cursor>` — EDGE pulls pages, stages into Machine Import with
   `source_type = 'cloud_app'`. Cursor is server-issued (no gaps, no duplicates).
3. `POST /sync/ack` — EDGE confirms the last committed cursor.
4. `PUT /sync/payslips` — later phase.

**Collections (MongoDB):**

| Collection | Key fields | Notes |
|---|---|---|
| `organisations` | id, name, billing_org_id, plan, sync_key_hash, created_at | plan = `early_access` for all at launch |
| `employees` | org_id, emp_code, name, dept, status, app_role, password_hash | copied from EDGE |
| `face_profiles` | org_id, emp_code, embedding (192 floats), enrolled_at | no photos by default |
| `punches` | org_id, emp_code, at (UTC), type, source, gps, geofence_ok, liveness_ok, cursor | append-only |
| `offices` | org_id, name, lat, lng, radius_m | geofences |
| `requests` | org_id, emp_code, kind, dates, status, approver | leave / missed punch / visits |
| `devices` | org_id, emp_code, fcm_token, app_version, last_seen | push + support |
| `audit_log` | org_id, actor, action, at | who changed what |

## 7. Security, privacy, compliance

- Tenant isolation: every record has `org_id`; one data-access layer filters by the token's org;
  automated test that tries cross-org reads.
- Face data: phone computes the 192-number MobileFaceNet embedding; only that is sent. Punch photos off
  by default (90-day retention if an org enables them).
- DPDP Act 2023: first-launch notice + recorded consent; employees can see their data and ask HR to
  delete it; leaving the company deletes the face profile.
- HTTPS only in Cloud mode (LAN mode keeps plain HTTP); hashed passwords and sync keys; no secrets in git.
- Nightly encrypted DB backup, 30 days kept, monthly restore test.
- Support access to an org's data only with the owner's in-app approval, logged.

## 8. Registration on the IoT billing platform

**Already exists (found on the VPS 2026-11-02, `/var/www/billing-platform`, deployed by pscp, not git):**
`POST /api/edgefolio/signup` (creates `Client` + free `EdgeLicense` with `licenseKey`; used by the
website `/onboard`), `POST /api/edgefolio/activate` (binds licence to the office PC `machineId`),
`POST /api/edgefolio/heartbeat` (daily: `activeEmployees`, `appVersion`, `lastPayrollRun`; returns the
announcement), superadmin `/licenses` list/extend/block/reset + `/announcement`. Models: `EdgeLicense`
(licenseKey, clientId, plan{name:'free', maxEmployees:null}, status trial|active|expired|blocked,
machineId, activatedAt, appVersion, createdVia), `EdgeHeartbeat`, `EdgeAnnouncement`, `CommissionLedger`.
→ **Every EDGE user is already registered.** Reuse, don't rebuild:

- **Existing EDGE users:** EDGE "Cloud sync" setup sends its `licenseKey`; the cloud verifies it with the
  billing platform, creates/links the cloud organisation to the same `clientId`, and returns the sync
  key. No second sign-up.
- **New cloud-first users:** the existing `/api/edgefolio/signup`, then the same link step.
- Billing-platform change (Phase 4, small): add a cloud plan to `EdgeLicense` (e.g. `cloud: { plan:
  'early_access', orgId, maxActiveEmployees: 50, linkedAt }`) + a server-to-server verify endpoint for the
  cloud. Follow the platform rules: own files per EdgeFolio feature, backup before pscp, `pm2 reload`.
- The cloud stores `billing_org_id` = the `Client` id (plus the `licenseKey` it was linked with).
- Also noted: `community/SAMA/EDGEFOLIO_REUSE.md` (Jul 2026) plans a SAMA→EdgeFolio bridge — keep the
  sync API generic enough for a second consumer.
- Recorded: owner phone, business details, sign-up date, daily usage report (active employees,
  punches, features used).
- 50-employee cap held on the billing record (raise per org without a release).
- Never block attendance: past the cap, keep recording and alert **our** team, not the customer.
- EDGE: the sync key ties EDGE to the registered org; EDGE stays free and works if the cloud is down.
- Later, if monetisation is chosen: plans/payment through the billing platform's existing flow.

## 9. Phased build plan (rough; one full-time developer + review)

1. **Decide and set up (weeks 1–2):** product name, cloud subdomain; cloud as its own PM2 process +
   MongoDB database on the shared VPS, all addresses from env vars; skeleton in `VPS/src`.
2. **Cloud core (weeks 2–6):** organisations, logins, employees, punches, faces, offices; App API
   matching `apk.js`; tenant-isolation tests; nightly backups. **Gate: API passes isolation tests.**
3. **App Cloud mode + EDGE sync (weeks 6–9):** mode choice at setup, HTTPS-only Cloud mode, offline queue
   to cloud; EDGE "Cloud sync" settings, employee push, punch pull into Machine Import; geofence.
4. **Sign-up + registration (weeks 8–11):** website + app sign-up with OTP; billing-platform registration
   with early-access plan; usage reporting; consent screen; basic owner web dashboard.
5. **Private beta (weeks 11–13):** 20 organisations (2–3 with U5); load test 500 orgs × 50 employees;
   fix list. **Gate: 99.5% of beta punches synced, no data leaks.**
6. **Public launch (week 14):** free early access opens; referral links; early members' WhatsApp group.

## 10. Hosting: start shared, move when needed (CODE FOR THIS)

- **Now:** existing shared VPS (154.61.69.200), own PM2 process + port, own MongoDB database, behind the
  existing nginx on a subdomain (e.g. `cloud.edgefolio.iotsoft.in`). Check `pm2 list` and ports first
  (see memory `project_vps.md` for used ports); the VPS has OOM'd on builds before → build locally, ship
  `dist` (same approach as FireGuard).
- **Portability rules for the code:**
  - Every address from environment variables: `MONGO_URL`, `PUBLIC_BASE_URL`, `BILLING_API_URL`,
    `BILLING_API_KEY`, `FILE_STORE_DIR`, `PORT`. No IP, hostname or absolute path in code.
  - Stateless API: no per-request state in process memory (sessions = JWT; rate limits/caches in Mongo
    or a pluggable store), so a 2nd instance / 2nd VPS can sit behind nginx.
  - App and EDGE only ever know `PUBLIC_BASE_URL` → a move is invisible to them.
  - Files (if photos ever enabled) behind one storage module, so local disk can later become object storage.
  - Health endpoint `/health` + response-time logging from day one (needed for the move trigger).
- **Move trigger:** median punch response > 500 ms at the morning peak, VPS memory > 80% for a week, or
  200 active organisations — whichever first. Move = new VPS, restore latest backup, switch the
  subdomain's DNS.

## 11. Risks, open decisions, metrics

| Risk | Mitigation |
|---|---|
| Shared VPS capacity at peak | Monitor from day one; move at the trigger (section 10) |
| Photo spoofing | Liveness already in app; flag failed-liveness punches |
| Sign-ups that never use it | Setup call after 3 days with no punches; reminders; archive after 60 days |
| Two sources of employee data | EDGE is the only master |
| Support load | In-app help, WhatsApp group, FAQs from beta |
| Android only | iOS later (needs a Mac) |

Open decisions:
- [ ] Product name ("EdgeFolio Cloud" or a separate brand)
- [ ] Cloud-only use without EDGE (attendance + Excel export)?
- [ ] Exact subdomain; whether the DB moves first when load grows
- [ ] Whether/how to monetise — later, from usage data; nothing published meanwhile

Metrics: 500 active orgs in 6 months (internal) · ≥60% still active at month 6 · ≥30% of sign-ups by
referral · ≥70% of each active org's employees punching daily · ≥99.5% punch success.

## Progress log
- 2026-11-02 — Plan written (doc + this file). Decisions: free early access, no pricing shown anywhere,
  registration on IoT billing platform, 50 employees/org, start on shared VPS, code for portability.
- 2026-11-02 — **Phase 1 started.** Service lives in `VPS/cloud/` (new package; the empty `VPS/src`
  skeleton is an older design, left alone). Skeleton: config from env, `/health` with response-time
  stats, PM2 config (heap 160 MB, restart > 200 MB, port 3090), nginx snippet, 5 tests passing,
  `deploy/first-time-setup.sh`. Public URL for now: `https://edgefolio.iotsoft.in/cloud/` (no DNS for a
  subdomain yet). VPS facts: Node 20, MongoDB 4.4 **with auth**, 2 GB RAM (~600 MB free), ~20 PM2 apps;
  checkout is inside a shared pnpm workspace → always `pnpm install --ignore-workspace` in `VPS/cloud`.
  Code pulled and deps installed on the VPS. **Waiting on owner:** (a) create Mongo user
  `edgefolio_cloud` (readWrite on `edgefolio_cloud`) and put its password in `VPS/cloud/.env`;
  (b) run `deploy/first-time-setup.sh` on the VPS (nginx + PM2 changes need owner approval).
- 2026-11-02 — Setup script run on the VPS with owner approval: `.env` created (JWT generated),
  nginx `location /cloud/` added (backup `/root/nginx-edgefolio.bak.20261102-054417`), PM2
  `edgefolio-cloud` online (81 MB). `https://edgefolio.iotsoft.in/cloud/health` answers; db
  **disconnected** until the Mongo user exists. Marketing site + downloads verified still 200.
  Found existing EdgeFolio registration in the billing platform → §8 rewritten to reuse it.
  **Still waiting on owner:** Mongo user `edgefolio_cloud` + password in `.env`.
- 2026-11-02 — **Phase 1 DONE.** Mongo user `edgefolio_cloud` created in `admin` db (readWrite on
  `edgefolio_cloud` only, same `authSource=admin` pattern as the other apps), random password written
  straight into `VPS/cloud/.env` on the server (never printed). Public
  `https://edgefolio.iotsoft.in/cloud/health` → 200, db connected, ~66 MB RSS.
  How Mongo users get created on this VPS: admin user `mongoAdmin` (credentials in the Jenix Community
  One project memory, `reference_mongodb_credentials.md`); write the JS to a file and run
  `mongo admin -u mongoAdmin -p … --authenticationDatabase admin file.js` (avoids quoting problems).
  Note: mongod listens on 127.0.0.1 **and the public IP** — check the firewall blocks 27017 from outside.
  **Next: Phase 2 — cloud core** (orgs, logins, employees, punches, faces, offices; App API matching
  `apk.js`; tenant-isolation tests; nightly backups).
- 2026-11-02 — **Phase 2 DONE** (commits 2d1e255 … 3884367, deployed). In `VPS/cloud/src`:
  `models.js` (orgs, employees, faces, punches, attendance days, offices, work assignments, holidays,
  audit log), `tenancy.js` (`forOrg(orgId)` = the only route to tenant data), `auth.js` (company code
  via `X-Org-Code`/`orgCode` for public endpoints; JWT with orgId after login), `routes/apk.js` (config,
  login-check, offices, auth/login, fcm-token, today-status, attendance, checkout, batch-sync, live-feed,
  faces ×3, employees, profile, attendance-history/calendar — EDGE shapes), `routes/authRoutes.js`
  (change-password), `orgAdmin.js` + `scripts/create-org.js`. **Design decisions:** company code (6 chars,
  no look-alikes) replaces the server address in the app; empId always from the token; office punches
  allowed (`settings.allowOfficeMobile`), EDGE's tour/wfh assignment gate opt-in
  (`settings.requireWorkAssignment`); geofence recorded (`geofenceOk`), not enforced yet.
  Tests: 19/19 on in-memory MongoDB 4.4 (`node --test --test-concurrency=1`; first run downloads the
  binary — Avast may lock it once → rerun). Live: `node scripts/smoke-test.js` on the VPS → 10/10 PASS
  (median 22 ms). Backups: `deploy/backup.sh` (encrypted, 30 days, `/root/backups/edgefolio-cloud`),
  cron 02:30 via `deploy/install-backup-cron.sh`; restore verified to decrypt. **Owner action:** copy
  `BACKUP_PASSPHRASE` from `VPS/cloud/.env` to a safe place off the server.
  Not yet built (later phases): work-assignment admin, alerts, broadcast, analytics, payroll views,
  payslips, leave, requests/visits/support/documents, forgot-password, offices admin, login rate limit.
  **Next: Phase 3 — app Cloud mode + EDGE sync.**
