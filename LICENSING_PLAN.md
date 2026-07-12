# EdgeFolio Licensing & Central Control — Implementation Plan

> **Goal:** Ship EdgeFolio (EDGE Electron app) as an installer any client can run, but with
> licensing controlled centrally from the IOT Soft billing platform (`D:\IOT Device\Billing at IOT soft`,
> live at iotsoft.in, billing-platform PM2 on VPS port 3010). We track who uses it, for how many
> days, and with how many employees. Self-serve: user fills a form → gets a 6-month trial license
> instantly → on expiry must purchase a plan to continue.
>
> **Execution model:** Step-by-step. Each step is coded by a Sonnet agent following this plan
> exactly, then reviewed before the next step starts.
>
> Date: 2026-07-10. Derived from `audit.md` (SEC-01/02/03) + user requirements.

---

## Architecture (decided — do not re-litigate)

- **Activate once online, then fully offline.** EdgeFolio is offline-first payroll; internet is
  only needed at activation and opportunistically for heartbeats.
- **Signed license file.** VPS signs a license JWT with an **RS256 private key**; the Electron app
  verifies with the **embedded public key**. Client cannot forge or edit limits/expiry.
- **Machine binding.** License is bound to a machine fingerprint at first activation.
- **Two credential layers.** (a) License/activation = controlled by IOT Soft. (b) Local operator
  logins (admin/HR users) = created by the client inside the app after activation.
- **Heartbeat telemetry = counts only.** `{licenseKey, machineId, activeEmployees, appVersion,
  lastPayrollRun}`. NEVER employee names, salaries, or biometric data.
- **Expiry handling: read-only mode, never data lock-out.** Past expiry + 15-day grace → app
  becomes read-only (view/export allowed; no new attendance, no payroll runs) with a renewal banner.
- **Trial:** 180 days, issued automatically from a public signup form (in-app activation screen).
  Renewal/extension goes through the existing billing invoice + payment-link machinery.

```
┌────────────────────────────┐          ┌─────────────────────────────────┐
│ Client PC — EdgeFolio       │  HTTPS   │ VPS iotsoft.in                   │
│ Electron + Express + SQLite │◄────────►│ billing-platform (port 3010)     │
│                             │          │ MongoDB: platform_clients,       │
│ license.json (RS256-signed) │ activate │   edge_licenses, edge_heartbeats │
│ jwt-secret.key (per-install)│ heartbeat│ RS256 private key (.env/file)    │
│ RS256 PUBLIC key (embedded) │ signup   │ Admin UI: billing-client SPA     │
└────────────────────────────┘          └─────────────────────────────────┘
```

---

## STEP 1 — EDGE auth fix (SEC-01, SEC-02, SEC-03)  ⚠️ prerequisite for everything

**Repo:** `D:\IOT Device\Salary_On\smart_salary\EdgeFolio\EDGE`
License control is meaningless while the local API accepts anyone as admin.

### 1.1 New file `backend/config/secrets.js`
- Export `getJwtSecret()`:
  - If `process.env.JWT_SECRET` is set, length ≥ 32, and not the `.env.example` placeholder
    (`change-me-in-production`) → use it.
  - Else read `path.join(STORAGE_DIR, 'jwt-secret.key')` (STORAGE_DIR from `config/app.js`).
  - Else generate `crypto.randomBytes(48).toString('hex')`, `mkdirSync` the dir recursive,
    write the file (mode 0o600), and use it.
  - Cache in a module-level variable.

### 1.2 Rewrite `backend/middleware/auth.js` (strict)
- `requireAuth(req, res, next)`: extract Bearer token. **No token → 401** `{ ok:false, error:'Authentication required' }`.
  Invalid/expired token → 401 `{ ok:false, error:'Invalid or expired session. Please sign in again.' }`.
  Valid → `req.user = jwt.verify(token, getJwtSecret())`, `next()`.
- Remove `LOCAL_USER` fallback and the `optionalDemoAuth` export entirely (grep-verified: unused elsewhere).
- Add `requireRole(...roles)` middleware: 403 `{ ok:false, error:'Insufficient permissions' }` if
  `!req.user || !roles.includes(req.user.role)`.

### 1.3 `backend/server.js` route mounting order
Current bug: `app.use(requireAuth)` is mounted globally BEFORE `/apk` routes, but `routes/apk.js`
has public endpoints (`/config`, `/login-check`, `/offices`, `/auth/login`) that only work today
because auth is a no-op. Fix:
- Mount `app.use(`${API_PREFIX}/apk`, apkRoutes)` **before** the global `app.use(requireAuth)`
  (the apk router applies `requireAuth` internally at the right point — keep that).
- `/auth` stays public (already mounted before requireAuth). Everything else stays behind requireAuth.

### 1.4 `backend/controllers/authController.js`
- Replace `const JWT_SECRET = process.env.JWT_SECRET || 'edgefolio-local-dev-jwt-secret'` with
  `getJwtSecret()` from `config/secrets`. Remove `JWT_SECRET` from module.exports (unused elsewhere).
- Add `statusHandler` → `GET /auth/status` (public): returns `{ setupRequired: <users table count === 0> }`.
- Add `setupHandler` → `POST /auth/setup` (public): body `{ email, password }`.
  - 409 if users table is non-empty (setup already done) — race-safe: do the count check and
    insert in one better-sqlite3 transaction.
  - Validate: email format, password length ≥ 8. 400 otherwise.
  - Create user with role `admin` using the same scrypt salt:hash format as `changePasswordHandler`.
  - Return the same shape as login: `{ token, user: { id, email, role } }` (sign JWT, 24h) so the
    frontend can log straight in.

### 1.5 `backend/controllers/apkController.js`
- Same JWT secret replacement (line ~9, used at ~103 in `apkLoginHandler`).
- Delete its local `requireRole` definition and export; instead `routes/apk.js` imports
  `requireRole` from `../middleware/auth`. (Check `apkController.js` for the local definition and
  keep its exact role names — 'hr-admin', 'owner' — working.)

### 1.6 `backend/config/database.js`
- Delete `ensureAdminUser()` and its call in `getDb()` (removes the seeded
  `admin@edgefolio.com` / `password` account — SEC-02). Existing installs keep whatever users
  exist in their DB; brand-new installs get an empty users table → setup flow.

### 1.7 Frontend `frontend/src/services/api.js`
- Add `getAuthStatus = () => http.get('/auth/status')` and
  `setupAdmin = (email, password) => http.post('/auth/setup', { email, password })`.
- In the response error interceptor: if `err.response.status === 401` and the request URL is not
  an `/auth/` endpoint → remove `ef_token` + `ef_user` from localStorage and dispatch
  `window.dispatchEvent(new Event('ef:unauthorized'))` before rejecting.

### 1.8 Frontend `frontend/src/App.jsx`
- Add a `useEffect` listening for `ef:unauthorized` → same behavior as `handleLogout`.

### 1.9 Frontend `frontend/src/pages/LoginPage.jsx`
- **Remove the fake 2FA** (hardcoded `123456` — it's security theater): on successful login call
  `onLoginSuccess(user, token)` directly.
- **Remove the "Default credentials" footer block** (prints admin password on screen).
- On mount, call `getAuthStatus()`. If `setupRequired` → render a **Create Admin Account** form
  instead of login: email, password, confirm password (client-side match + min 8 check), submit →
  `setupAdmin()` → on success call `onLoginSuccess(user, token)`. Keep the existing visual style
  (slate/sky Tailwind, same card layout).

### 1.10 Tests / verification
- Check `EDGE/package.json` for a test script; if backend tests exist, run them and fix
  auth-related failures (tests likely need to bootstrap via `/auth/setup` + login and send the
  Bearer token; NODE_ENV=test uses `edgefolio-test.db`).
- Manual smoke (curl or node): boot backend → `GET /api/v1/employees` returns **401**;
  `GET /api/v1/auth/status` on fresh DB returns `setupRequired:true`; `POST /auth/setup` → token;
  authorized request with token → 200; second `/auth/setup` → 409; `POST /api/v1/apk/auth/login`
  reachable without token (not 401 from the global middleware).
- Do NOT commit; leave changes in working tree for review.

---

## STEP 2 — Billing server: EdgeFolio product + self-serve trial + license APIs

**Repo:** `D:\IOT Device\Billing at IOT soft\billing-server` (deployed at `/var/www/billing-platform`, port 3010).
**Read `CLAUDE.md` and `STATUS.md` there first.** Rules: money in paise, productId scoping,
JWT isolation, one file per module, ~150-line file cap.

### 2.1 Product + keys
- Insert `edgefolio` into `platform_products` (one-off script or reuse existing product-creation
  admin API — check how hotel-qr was inserted).
- Generate an RS256 keypair for license signing:
  - Private key → VPS `.env` path reference, e.g. `EDGE_LICENSE_PRIVATE_KEY_FILE=/var/www/billing-platform/keys/edge-license-private.pem`
  - Public key → will be committed into the EdgeFolio Electron repo in Step 3.
  - Locally, generate the pair into `billing-server/keys/` (gitignored) + a README note.

### 2.2 New Mongo models (billing-server/src/models/)
- `EdgeLicense.js`: `{ licenseKey (unique, format EF-XXXX-XXXX-XXXX-XXXX from crypto), clientId (ref platform_clients),
  plan: { name, maxEmployees, }, status: 'trial'|'active'|'expired'|'blocked',
  issuedAt, expiresAt, graceDays (default 15), machineId (null until activation), activatedAt,
  appVersion, createdVia: 'self-serve'|'admin' }`
- `EdgeHeartbeat.js`: `{ licenseKey, machineId, activeEmployees, appVersion, lastPayrollRun,
  receivedAt }` (+ index on licenseKey+receivedAt). Keep raw rows; dashboard aggregates.

### 2.3 Public API routes (no auth, rate-limited) — `src/routes/edgefolio.routes.js`
Mounted under `/api/edgefolio/` (nginx already proxies `/api/` → 3010 per STATUS.md).
- `POST /api/edgefolio/signup` — body `{ companyName, contactName, phone, email }` (validate all).
  Creates a `platform_clients` record (product = edgefolio, source self-serve) + an EdgeLicense:
  trial, 180 days, `maxEmployees` from a `EDGE_TRIAL_MAX_EMPLOYEES` env (default 25).
  Returns `{ licenseKey, expiresAt, maxEmployees }`.
  Anti-abuse: reject if an unexpired trial license already exists for the same phone OR email.
- `POST /api/edgefolio/activate` — body `{ licenseKey, machineId, appVersion }`.
  - Unknown key → 404. `blocked` → 403.
  - First activation: bind machineId, set activatedAt.
  - Same machineId again → OK (re-install/repair).
  - Different machineId → 409 `{ error: 'License already activated on another machine. Contact support.' }`.
  - Success → `{ license: <RS256-signed JWT> }` with claims
    `{ licenseKey, clientId, plan: { name, maxEmployees }, status, issuedAt, expiresAt, graceDays, machineId }`.
- `POST /api/edgefolio/heartbeat` — body `{ licenseKey, machineId, activeEmployees, appVersion, lastPayrollRun }`.
  - Validate key+machine match; store heartbeat row; update license.appVersion.
  - Response: `{ ok: true, license?: <fresh signed JWT> }` — include a fresh signed license whenever
    the stored expiresAt/plan differs from what the current signature would say (i.e. after an
    admin extension, the next heartbeat auto-delivers the renewed license to the app).
- Rate limiting: express-rate-limit (or the pattern already used for `/pay` routes) on all three.

### 2.4 Superadmin routes — `src/routes/superadmin.edgefolio.routes.js`
(superadmin JWT, same guard as other superadmin routes)
- `GET /superadmin/edgefolio/licenses` — list with client info + latest heartbeat (aggregation):
  companyName, contact, status, activatedAt, expiresAt, machineId set?, lastSeen, activeEmployees, appVersion, daysUsed.
- `POST /superadmin/edgefolio/licenses/:id/extend` — body `{ months | untilDate, plan: { name, maxEmployees } }`;
  updates expiresAt/plan/status ('active'). This is the hook the invoice-paid flow calls later.
- `POST /superadmin/edgefolio/licenses/:id/reset-machine` — clears machineId (client moved PCs).
- `POST /superadmin/edgefolio/licenses/:id/block` / `unblock`.

### 2.5 Renewal business logic (wire, don't rebuild)
- Reuse the existing invoice + payment-link machinery (manual UPI flow is live; Razorpay pending).
- When admin confirms an EdgeFolio invoice as paid → call the same extend logic (service function,
  not HTTP): extend expiresAt by the plan period, set plan limits, status 'active'.
  Keep it minimal: a service `edgeLicense.service.js` used by both the superadmin route and the
  invoice-confirm hook.

### 2.6 Verification
- Local run against dev Mongo; curl the signup→activate→heartbeat happy path + the abuse cases
  (dup trial, wrong machine, blocked).
- Deployment to VPS is done LAST, manually reviewed (PLINK/pscp pattern from STATUS.md). Do not
  deploy from the coding agent.

---

## STEP 3 — EdgeFolio Electron: activation screen, enforcement, heartbeat

**Repo:** `EdgeFolio/EDGE`

### 3.1 Backend `backend/services/licenseService.js`
- Embedded RS256 **public key** (PEM constant in `backend/config/licensePublicKey.js`, generated in Step 2).
- Machine fingerprint: hash of stable hardware identifiers (e.g. `os.hostname()` +
  `os.cpus()[0].model` + Windows MachineGuid via `reg query HKLM\SOFTWARE\Microsoft\Cryptography /v MachineGuid`
  — wrap in try/catch, fall back to a random-but-persisted GUID in STORAGE_DIR).
- `getLicenseState()`: read `path.join(STORAGE_BASE, 'license.json')` → verify RS256 signature,
  machineId match, compute one of: `unlicensed | valid | expiring (≤15d left) | grace (expired,
  within graceDays) | readonly (past grace)`. Cache with reload on activation/heartbeat renewal.
- `activate(licenseKey)`: POST to `https://iotsoft.in/api/edgefolio/activate` with machineId +
  app version → store returned JWT to license.json.
- `signupTrial(form)`: POST signup → then immediately `activate()` with the returned key.
- `heartbeat()`: POST usage counts (activeEmployees = `SELECT COUNT(*) FROM employees WHERE
  status='active'` — check actual schema/column); if response contains a fresh license, replace license.json.
- Base URL from `CLOUD_SYNC_BASE_URL`-style env/config: `EDGE_LICENSE_API=https://iotsoft.in/api/edgefolio`.

### 3.2 Backend enforcement
- New route `backend/routes/license.js` mounted **public** (before requireAuth — the activation
  screen runs pre-login): `GET /license/status`, `POST /license/activate { licenseKey }`,
  `POST /license/signup { companyName, contactName, phone, email }`.
- Read-only gate middleware `requireWritableLicense`: if state is `readonly` → 403
  `{ ok:false, error:'License expired. Renew to continue.', code:'LICENSE_READONLY' }` on all
  mutating routes (apply to POST/PUT/PATCH/DELETE via a method check in one global middleware
  placed after requireAuth — allowlist `/auth/*`, `/license/*`, `/backup/*` (export must always work)).
- Employee-limit gate: in employees create handler(s) (desktop + APK), if active employee count ≥
  `plan.maxEmployees` → 403 `{ code:'LICENSE_EMPLOYEE_LIMIT', error:'Employee limit (<N>) reached.
  Upgrade your plan.' }`.
- Heartbeat scheduler: daily job in `backend/jobs/` (follow existing scheduler pattern), fire-and-
  forget with try/catch (offline is normal, never crash — audit STAB-01 applies).
- If state is `unlicensed` → all API routes except `/auth/*` + `/license/*` + `/health` return 403
  `{ code:'LICENSE_REQUIRED' }`.

### 3.3 Frontend
- `pages/ActivationPage.jsx` (same visual language as LoginPage): shown when
  `GET /license/status` → unlicensed. Two tabs:
  1. **Start Free Trial** — form: company, name, phone, email → `/license/signup` → shows the
     issued license key prominently ("save this key") → continue.
  2. **Enter License Key** — input EF-XXXX… → `/license/activate`.
  Both then proceed to first-run admin setup / login. Errors surfaced verbatim (dup trial, wrong
  machine, offline: "Internet connection required for one-time activation").
- App boot order in `App.jsx`: license status → ActivationPage | (setupRequired → Setup) | Login | Main.
- Read-only/expiring banner component: state `expiring` → amber "License expires in N days — renew";
  `grace`/`readonly` → red banner with WhatsApp +917240226566 renewal CTA. Handle
  `LICENSE_READONLY`/`LICENSE_EMPLOYEE_LIMIT` API errors with a clear modal, not a toast.
- Settings page: license section (key masked, plan, employees used/limit, expiry, "check for
  renewal now" button → triggers heartbeat).

### 3.4 Verification
- Full flow against a locally-running billing-server (Step 2) with test keys.
- Tamper test: hand-edit license.json expiry → app must treat it as invalid (signature fail).

---

## STEP 4 — Billing admin dashboard: EdgeFolio usage view

**Repo:** `D:\IOT Device\Billing at IOT soft\billing-client` (React TSX, Vite; one component per file, ≤150 lines).

- New page `pages/EdgeFolio.tsx` + route/nav entry: table from `GET /superadmin/edgefolio/licenses`:
  Company | Contact | Status chip | Activated | Last seen | Employees (used/limit) | Expires |
  Days used | Version | Actions.
- Actions per row: Extend (modal: months + plan limits → extend endpoint), Reset machine, Block/Unblock —
  each with confirm.
- Highlight rows: trial expiring ≤ 15 days (amber), not seen for > 14 days (grey), expired (red).
- Types in `types/index.ts`, API calls in `lib/api.ts` (existing axios instance).

---

## Deployment & follow-ups (after all steps reviewed)
- VPS deploy of billing-server/client changes: pscp + pm2 restart billing-platform (PLINK pattern
  in STATUS.md). Manual step, done with the user.
- Add telemetry disclosure line to iotsoft.in privacy/terms pages.
- Electron installer build (electron-builder) + auto-update already exist (`electron/updater.js`).
- Later hardening (separate tasks, from audit.md): CORS restriction (SEC-04), rate limiting on
  EDGE (RL-01), money→paise migration (MONEY-01), face-photo encryption at rest (PII-01/ENC-01),
  crash handlers (STAB-01), OTP on trial signup if abuse appears.
