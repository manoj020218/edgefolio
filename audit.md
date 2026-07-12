# EdgeFolio — Technical Audit Report

**Scope:** Full-stack audit of the EdgeFolio repo — the on-premise **EDGE** backend (Node/Express + SQLite, Electron desktop app, Python, mobile APK) that runs payroll/attendance and talks to biometric access-control machines (Zhongyan U5 via MQTT/HTTP), plus the **VPS** cloud layer (documented: sync, billing, monitoring, backup) and a marketing site.
**What it does:** Employee **attendance** (biometric face + device punches) → **payroll** processing → **bank payment advice** (salary disbursement). It handles **money** (salaries) and **sensitive biometric PII** (face photos), which sets the stakes for this audit.
**Objective:** Find bugs, crashes, "code that exists but doesn't work," and every plausible failure at the UI, UX, API, device, and VPS levels — with professional corrective actions.
**Date:** 2026-07-08
**Auditor:** Automated code review (Claude)

> **How to read this:** Findings are grouped by severity, each with an ID, concrete evidence (file/line), the realistic failure it causes, and a corrective action. A sequenced **Priority Remediation Plan** is at the end.

> **Two headlines up front:**
> 1. **The API has no real authentication.** `requireAuth` never rejects — any unauthenticated request is treated as `admin` (`EDGE/backend/middleware/auth.js`). Every payroll, employee, salary, bank, and biometric endpoint is open to anyone who can reach the server.
> 2. **The entire documented VPS cloud backend is empty.** All 25 files under `VPS/src/` (sync, billing, backup, monitoring, encryption, auth) are **0 bytes** and committed as stubs. The cloud sync / encrypted backup / billing described in the docs does not exist in code.

---

## Severity summary

| Severity | Count | Theme |
|---|---|---|
| 🔴 Critical | 4 | No-op auth (everyone is admin), default admin password, hardcoded JWT secret, unbuilt-but-documented cloud backend |
| 🟠 High | 6 | Float money for payroll/bank advice, unencrypted biometric PII, empty encryption module, no crash net on an unattended device, permissive CORS, device data trusted without device auth |
| 🟡 Medium | 5 | No rate limiting, 10 MB bodies + base64 photos, no input validation depth, single-instance MQTT service, empty VPS auth/rate-limit stubs give false assurance |
| ⚪ Low / hygiene | 4 | Console/file logging only, doc/reality drift, gitignored component, scaffolding clutter |

---

## 🔴 Critical findings

### SEC-01 — Authentication is a no-op: every request is treated as admin
**Evidence:** `EDGE/backend/middleware/auth.js`:
```js
function requireAuth(req, _res, next) {
  const token = ...;
  if (token) { try { req.user = jwt.verify(token, secret); } catch { /* ignore */ } }
  if (!req.user) { req.user = LOCAL_USER; }   // { role: 'admin', email: 'admin@edgefolio.com' }
  next();
}
```
`server.js:46` mounts it globally (`app.use(requireAuth)`) ahead of all protected routes. It **never returns 401** — no token, expired token, or forged token all result in `req.user = { role: 'admin' }` and `next()`. `optionalDemoAuth` is the same function.
**Impact:** The full API — `/employees`, `/payroll`, `/payments`, `/faces`, `/machines`, `/cashbook`, `/reports`, `/settings` — is reachable by **anyone with network access, with admin rights and no credentials**. That means reading/altering salaries, bank details, attendance, and biometric records, and triggering payroll/bank-advice. On a LAN-only device this is already risky; the repo also ships an **FRP tunnel** (`config/frpConfig.js`, `frpTunnelService`) to expose the edge node through the VPS — if that's enabled, this open admin API is reachable from the internet. This is the single most serious issue.
**Corrective action:** Make `requireAuth` **reject** when there's no valid token (return 401), and remove the `LOCAL_USER` admin fallback. If a genuine offline/local mode is required, gate it behind an explicit, non-default flag bound to `127.0.0.1` only, and never expose that mode through the FRP tunnel. Add role checks on privileged routes.

### SEC-02 — Seeded default admin account with password `password`
**Evidence:** `EDGE/backend/config/database.js` `ensureAdminUser()` inserts `admin@edgefolio.com` with `hashPassword('password')` on first boot when the users table is empty.
**Impact:** Every fresh install ships with a known admin credential. Combined with `SEC-01` it barely matters, but even after auth is fixed, `admin@edgefolio.com / password` is an obvious first thing to try — full payroll/PII takeover.
**Corrective action:** Force a password set on first launch (no usable default), or generate a random password shown once to the installer. Never seed a real, guessable password.

### SEC-03 — Hardcoded JWT secret fallback committed in source
**Evidence:** `middleware/auth.js` and `controllers/authController.js:7` — `process.env.JWT_SECRET || 'edgefolio-local-dev-jwt-secret'`. Tokens are `jwt.sign(..., JWT_SECRET, { expiresIn: '24h' })`.
**Impact:** If `JWT_SECRET` isn't set in production, tokens are signed/verified with a secret published in the repo — anyone can forge an admin token. (Once `SEC-01` is fixed, this becomes the next line of defense, so it matters.)
**Corrective action:** Remove the fallback; fail fast on boot if `JWT_SECRET` is unset or weak. Rotate the secret.

### BUILD-01 — The entire documented VPS cloud backend is empty, committed scaffolding
**Evidence:** All 25 tracked files under `VPS/src/` are **0 bytes**: `server.js`, `index.js`, every controller (billing, backup, monitoring, apk), every route (sync, billing, backup, monitoring, apk), every model (edgeNode, heartbeat, subscription, backup), every service (frpTunnel, mongo, sync, notification), and `middleware/auth.js`, `middleware/rateLimiter.js`, `utils/encryption.js`, `utils/validators.js`, `utils/logger.js`. `VPS/package.json` has no `main`, `scripts`, or dependencies. The only functioning VPS code is `VPS/marketing/server.js` (1.4 KB).
**Impact:** This is the ultimate "code is there but doesn't work." The documentation (`PROJECT_STATUS.md`, `PHASE_2_*`) describes cloud sync, edge-node monitoring, subscription/billing, and encrypted backup — **none of it is implemented**. Anyone (including future you) reading the repo would reasonably assume these exist. Concretely: (a) any deploy expecting `VPS/src` to run will fail (no entry point); (b) edge nodes that think they're syncing/backing up to the cloud have nothing to talk to; (c) the "encrypted backup" of payroll/biometric data is imaginary.
**Corrective action:** Either implement the VPS backend or clearly mark it as unbuilt (remove the empty files or move them to a `planned/` folder with a README stating status). Update the docs to reflect what actually exists vs. what's planned, so operational decisions aren't made on false assumptions. Ensure no edge-node code silently assumes the cloud endpoints exist.

---

## 🟠 High findings

### MONEY-01 — Payroll, salaries, and bank-advice amounts are floating point
**Evidence:** `EDGE/backend/migrations/sqlite-schema.sql` — `salary REAL`, `basic_salary REAL`, `gross REAL`, `net_salary REAL`, `total_amount REAL`, `amount REAL`, `hours_worked REAL`. Payroll math runs through `services/payrollEngine` on these floats.
**Impact:** Floating-point can't represent decimal currency exactly, so gross/net/deductions accumulate rounding error. In a **payroll and bank-payment-advice** system, that means salary figures and bank disbursement amounts can be off by paise — which is both a trust problem and a compliance/reconciliation problem when the bank advice total doesn't match the sum of payslips.
**Corrective action:** Store and compute money as **integer paise** (or a fixed-point/decimal library), round explicitly at defined points, and assert that the bank-advice total equals the sum of net payslips before export. Migrate the `REAL` columns.

### PII-01 — Biometric face photos are stored unencrypted on disk and served by the open API
**Evidence:** `controllers/faceController.js` decodes `imageBase64` and `fs.writeFileSync(filePath, buffer)` — raw JPEG under `FACES_DIR/<empId>/`. There is no encryption at rest, and (per `SEC-01`) the face endpoints require no authentication.
**Impact:** Facial biometrics are sensitive personal data (India's DPDP Act / GDPR-class). Storing them unencrypted on the device, retrievable through an unauthenticated API, is a serious privacy exposure — a stolen device or a reachable API leaks employees' biometric identities, which (unlike a password) can never be reset.
**Corrective action:** Encrypt biometric images at rest (per-install key from the OS keystore/DPAPI, not a hardcoded key — see `ENC-01`), lock the face endpoints behind real auth + role checks, restrict file-system access, define a retention/erasure policy, and obtain explicit consent. Prefer storing a non-reversible template over the raw photo where possible.

### ENC-01 — Encryption is either a hardcoded dev key or an empty module
**Evidence:** `EDGE/backend/utils/encryption.js` defaults the key to a committed constant: `getKey(secret = 'edgefolio-local-dev-key')`. `VPS/src/utils/encryption.js` is **0 bytes** (empty). 
**Impact:** Any data "encrypted" with the hardcoded key is effectively plaintext to anyone with the repo. The VPS-side encryption that the backup/sync design implies simply doesn't exist. So payroll/PII protection that the architecture suggests is not real.
**Corrective action:** Derive encryption keys from a per-install secret stored in the OS secure store (Windows DPAPI / keychain), never a source constant; fail if the key is absent in production. Implement (or remove the pretense of) VPS-side encryption before any real cloud backup ships.

### STAB-01 — No crash net on an unattended edge device running background jobs and device polling
**Evidence:** `EDGE/backend/index.js` starts schedulers (`startSchedulers()` — payroll, backup, sync, cleanup) and `u5Service.start()` (MQTT/HTTP device polling) at boot, with **no** `process.on('uncaughtException')` / `unhandledRejection` handlers (only SIGINT/SIGTERM graceful shutdown). `u5Service.start()` and `getDb()` aren't individually guarded.
**Impact:** An edge device runs unattended at a customer site. A single unhandled rejection in a scheduler tick, an MQTT message handler, or a device poll crashes the process — attendance stops being recorded and payroll jobs stop — potentially unnoticed until payday. Missing attendance data directly corrupts payroll.
**Corrective action:** Add top-level crash handlers (log + controlled exit for a supervisor/Electron auto-restart), wrap `u5Service.start()` and scheduler ticks in try/catch so one bad device/message can't take down the process, and add a watchdog/health signal so a stuck or crashed edge node is visible.

### SEC-04 — Fully permissive CORS with credentials
**Evidence:** `EDGE/backend/server.js:34` — `cors({ origin: (_origin, cb) => cb(null, true), credentials: true })` reflects **any** origin and allows credentials.
**Impact:** Combined with the open API, any website a logged-in operator visits could script requests to the local/tunneled API (CSRF-style) and read/modify payroll and biometric data.
**Corrective action:** Restrict origins to the known desktop/mobile app origins; don't reflect arbitrary origins with credentials enabled.

### DEV-01 — Device/attendance ingestion is trusted without device-level authentication
**Evidence:** Attendance/device data flows in via `machineController`, `u5Controller`, and `u5MachineService` (MQTT/HTTP). With `requireAuth` a no-op (`SEC-01`), the HTTP ingestion endpoints accept punches with no auth; MQTT topic/broker auth isn't enforced in-app.
**Impact:** Attendance drives payroll. If anyone can inject punch records (fake check-ins/outs), they can inflate hours and thus salaries, or erase attendance to dock pay — payroll fraud with a money impact. Face-match values (`face_match REAL`) coming from devices are likewise trusted.
**Corrective action:** Authenticate devices (per-device keys/certs), validate that a punch references a known enrolled employee+device, sign/verify MQTT payloads or secure the broker with ACLs, and add server-side plausibility checks (duplicate/for-the-future punches, impossible sequences).

---

## 🟡 Medium findings

### RL-01 — No rate limiting on the API (including login)
**Evidence:** No `express-rate-limit` in `EDGE/backend`; the VPS `middleware/rateLimiter.js` is an empty stub.
**Impact:** `/auth` login and all endpoints can be hammered — brute force, scraping, or accidental DoS from a misbehaving device/app.
**Corrective action:** Add global + login-specific rate limiting once real auth is in place.

### PERF-01 — 10 MB JSON bodies with base64 images
**Evidence:** `express.json({ limit: '10mb' })`; face enrollment posts `imageBase64`.
**Impact:** Large base64 bodies pressure memory and bloat the SQLite DB/backups if images are ever stored inline; a DoS vector on a small edge device.
**Corrective action:** Use multipart uploads for images, cap sizes tightly, and keep photos as files (encrypted) rather than in JSON/DB.

### VAL-01 — Shallow input validation on money/attendance writes
**Evidence:** Controllers largely trust body fields; `validators.js` exists but coverage is uneven (e.g. numeric/positive checks on salary, deductions, hours aren't consistently enforced).
**Impact:** Bad/negative/non-numeric values can enter payroll inputs and skew salary math (compounding `MONEY-01`).
**Corrective action:** Enforce type/range validation on every money and attendance write; reject out-of-range values.

### SCALE-01 — Single-instance MQTT/device service with in-process state
**Evidence:** `u5Service.start()` runs in the API process; device/session state is in-memory.
**Impact:** Fine for one edge device, but the service can't be scaled or restarted without losing in-flight device state; a crash (see `STAB-01`) drops it.
**Corrective action:** Isolate the device service (separate process/worker) with reconnection and persistence of critical state.

### FALSE-01 — Empty VPS auth/rate-limit/validator stubs create a false sense of security
**Evidence:** `VPS/src/middleware/auth.js`, `rateLimiter.js`, `utils/validators.js`, `utils/encryption.js` are all 0 bytes but named as if implemented.
**Impact:** Reading the file tree implies these protections exist. If any VPS work resumes and wires routes to these stubs, the app will run with **no** auth/rate-limit/validation while appearing to have them.
**Corrective action:** Don't ship named-but-empty security modules. Implement or delete; if kept as placeholders, make them throw "not implemented" so they can't silently pass traffic.

---

## ⚪ Low / hygiene findings

### HYG-01 — Logging is console/file only, no structured/rotated logs
For an unattended device processing payroll, add structured logging with rotation and a way to surface errors remotely (important given `STAB-01`).

### HYG-02 — Documentation describes features that aren't built
`PROJECT_STATUS.md` / `PHASE_2_*` describe cloud sync, billing, monitoring, encrypted backup that don't exist in code (`BUILD-01`). Align docs with reality to avoid operational decisions based on non-existent capabilities.

### HYG-03 — `ImportModal.jsx` is gitignored "for contact info"
`.gitignore` excludes `ImportModal.jsx` (comment: "contact info"). A source component excluded from version control means it's missing from clean clones/CI and its history is untracked — a build/"works on my machine" hazard. Move any secret data out of the component and track the code.

### HYG-04 — Scaffolding and build artifacts clutter the repo
Empty `VPS/src` tree, committed docs sprawl, `APK/`, `releases/`, `dist-exe/` references. Keep binaries/artifacts out of git and prune empty scaffolding.

---

## Priority remediation plan

**Do this week (access control — the API is currently open):**
1. `SEC-01` Make `requireAuth` reject unauthenticated requests; remove the admin fallback; add role checks. Ensure the FRP tunnel never exposes an unauthenticated API.
2. `SEC-02` Remove the default `password` admin; force first-run password set.
3. `SEC-03` Remove the hardcoded JWT secret fallback; fail fast if unset.
4. `DEV-01` Require device authentication before accepting attendance/face-match data.

**Do this month (money, PII, resilience):**
5. `MONEY-01` Move payroll money to integer paise; assert bank-advice total = sum of payslips.
6. `PII-01` + `ENC-01` Encrypt biometric images at rest with a per-install key; lock face endpoints behind auth; retention/consent policy.
7. `STAB-01` Crash handlers + guard schedulers/device service; add a watchdog/health signal.
8. `SEC-04` Restrict CORS; `RL-01` add rate limiting.

**Do this quarter (truth-in-code + cloud):**
9. `BUILD-01` + `FALSE-01` Implement or clearly mark the VPS backend; remove named-but-empty security modules; align docs with reality.
10. `VAL-01`, `PERF-01`, `SCALE-01`, hygiene items.

---

## Positive notes (what's already done well)

- **Passwords use `scrypt` with a random per-password salt** (`config/database.js`, `authController.js`) — a strong, modern hashing choice.
- **No real secrets are committed** — only `.env.example` files are tracked; the DB and `.env` are gitignored.
- **SQLite is set up sensibly** (better-sqlite3, guarded idempotent migrations, `columnExists` checks) and the EDGE backend controllers are substantive and organized by domain.
- **Graceful shutdown** (SIGINT/SIGTERM) stops schedulers and the device service and closes the DB cleanly, with a 5 s force-exit backstop.
- The **domain modeling is thorough** — attendance, shifts, leaves, deductions, earnings, holidays, cashbook, disputes, bank advice — a solid foundation once the auth, money-type, and PII-encryption gaps are closed.

> **Bottom line:** The EDGE application is feature-rich and well-organized, but it currently runs with **no effective authentication**, **plaintext biometric storage**, and **floating-point payroll money**, while the **documented cloud backend doesn't exist**. Fixing auth (`SEC-01`) is the urgent first step — until then, treat the API as fully open and keep the edge device off any untrusted network and off the FRP tunnel.
