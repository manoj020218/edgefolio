# EdgeFolio — Marketing, Licensing & Distribution HANDOFF

**Last updated:** 2026-08-14
**Covers:** the self-serve onboarding flow, the free-forever licensing model, the
installer/distribution pipeline, and everything found broken and fixed along the way.
**Read this before touching `/onboard`, `VPS/marketing/`, the billing-server EdgeFolio
routes, or the Electron installer build.**

Testing of this work by the product owner is still pending as of this writing — treat
everything below as "implemented and deployed" but **not yet end-to-end verified by a
real user on a clean machine**. Update this doc with results once that happens.

---

## 1. Three repos are involved

| Repo | Local path | Deploy method | Live at |
|---|---|---|---|
| EdgeFolio (this repo) | `D:\IOT Device\Salary_On\smart_salary\EdgeFolio` | `git push` → VPS `git pull` + `pm2 restart edgefolio-marketing` | edgefolio.iotsoft.in |
| Billing platform | `D:\IOT Device\Billing at IOT soft` | **NOT git-based on the VPS** — manual `pscp` of changed files to `/var/www/billing-platform`, then `pm2 reload billing-platform`. See §7. | iotsoft.in (billing API + superadmin dashboard) |
| — | VPS | 154.61.69.200, SSH via PLINK only (`D:\plink_git.bat`, `D:\pscp_git.bat` — password embedded, not in git) | — |

The EdgeFolio Electron desktop app (`EDGE/`) lives in this same repo but is **not
deployed to the VPS** — it's built locally with electron-builder and the resulting
installer is uploaded to `VPS/marketing/downloads/` (see §5).

---

## 2. What shipped

### 2.1 Marketing site (`VPS/marketing/`)
- SEO: `robots.txt`, `sitemap.xml`, JSON-LD structured data, OG/Twitter tags, favicon (the
  site had none of this before).
- New page **`/onboard`** — public self-serve signup, UI shape borrowed from Jenix
  Community One's `/onboard` (card-sectioned form → success screen with a copyable
  license key), re-themed to EdgeFolio's dark blue/cyan palette. Optional **Agent Code**
  field, optional **"Sign in with Google"** quick-fill (verifies email server-side only —
  does not create an account, does not gate signup).
- `server.js` additions: `POST /api/onboard` (proxies to billing server, keeps the billing
  API base + any secrets out of the browser), `GET /api/onboard/google-config`,
  `POST /api/onboard/google-verify`.
- `/download` and `/download/portable` serve the installer directly from
  `VPS/marketing/downloads/` (gitignored via the repo's `*.exe` rule — never committed,
  always deployed via `pscp`).
- **All GitHub references removed** from the site and legal pages — the "View on GitHub"
  CTA, contact rows, and the GitHub-Releases download fallback are gone. That fallback
  redirected to `github.com/manoj020218/edgefolio/releases`, which has **zero releases
  published** — it was silently broken.
- `/onboard` never lets a signup failure block getting the app: there's always a
  "download directly, no form required" link, and any signup error (duplicate, network,
  server) also surfaces a direct download link inline.

### 2.2 Licensing model — now genuinely free forever
Local/offline EdgeFolio has no marginal hosting cost, so it was wrong to frame it as a
180-day/25-employee trial. Changed in `billing-server/src/controllers/edgefolio.controller.js`:
- `expiresAt` is pushed **99 years out** at signup (not nullable — kept the existing
  Date field type to avoid touching the client-side expiry state machine; it just never
  fires in practice).
- `plan.maxEmployees` is **`null` (unlimited)** instead of defaulting to 25.
  `EdgeLicense.js` schema default was also changed from `25` to `null`. Every place that
  reads `maxEmployees` (EDGE employee-limit gate, Settings display, billing dashboard
  table) already treats falsy/null as "no limit" — verify this holds if you add new
  consumers of `plan.maxEmployees`.
- `status: 'trial'` is **kept as the internal enum value** (schema unchanged, to avoid
  disrupting existing production records) but now means "registered, not on a paid cloud
  plan" — not a time-limited trial. `status: 'active'` is reserved for a future paid
  cloud-service tier (sync/backup/mobile access) that doesn't exist yet.
- **Important fix inside `edgeLicense.service.js`:** the signed JWT license had its own
  `expiresIn: '400d'` on top of the payload's `expiresAt` field. With a 99-year
  `expiresAt`, that 400-day JWT-level cap would have silently broken license verification
  for any machine offline for more than ~13 months — exactly the offline-first use case
  this app targets. Removed `expiresIn` entirely; the app already validates the payload's
  own `expiresAt`, not the JWT's `exp` claim (see the comment in `licenseService.js`).
- All marketing/in-app copy changed from "180 days free" / "25 employees" to "free
  forever" / "unlimited" — `index.html`, `onboard.html`, `ActivationPage.jsx`.

### 2.3 Agent code
Optional referral field, mirrors how Jenix Community's bridge already handled it:
entered on `/onboard` → passed through `/api/onboard` → `Client.agentCode` (new field on
the shared `Client` model in billing-server — used by many products, so keep this field
generic if you touch it) → surfaced in the superadmin dashboard (`EdgeLicenseTable.tsx`,
plus a "Via Agent Code" summary card in `EdgeFolio.tsx`). **No validation against a real
agent/salesman registry** — it's stored as free text, same as Jenix's implementation.
There IS an existing `Salesman` model with `salesmanCode` in billing-server that this
could eventually reconcile against for real commission attribution, but that's not wired
up (deliberately out of scope — see the commit message on `fab4d05`/`0beb7eb`).

### 2.4 Announcement banner (replaces the GitHub auto-updater)
`electron-updater`'s GitHub Releases check was **permanently broken** — confirmed via the
GitHub API that `github.com/manoj020218/edgefolio` has **zero releases ever published**.
Every installed copy hit this on every launch, and — worse — the failure crashed onto
the login screen as a full-screen wall of raw text (see §3.1).

Fix: `electron/updater.js`'s `checkForUpdates()` calls are **commented out** (not
deleted — re-enable once a real `electron-builder --publish` pipeline with actual
GitHub Releases exists). Replaced with a lightweight in-app announcement system:

- `billing-server`: `EdgeAnnouncement` model (single active document), included in every
  `POST /api/edgefolio/heartbeat` response as `announcement: {message, url, level} | null`.
  Superadmin CRUD at `GET/PUT/DELETE /superadmin/edgefolio/announcement`, editable from
  the billing dashboard (`EdgeAnnouncementPanel.tsx` — its own component file, not inlined
  in the page, per the "16+ products share this billing codebase" organization
  requirement — **keep doing this for any future EdgeFolio-specific dashboard UI**).
- `EDGE`: `licenseService.js` caches the announcement to `announcement.json` (alongside
  `license.json`, same `STORAGE_BASE`) on every successful heartbeat. New public route
  `GET /license/announcement`. New `AnnouncementBanner.jsx` frontend component, fetched
  once on mount, dismissal remembered per-message-text in `localStorage`.
- Freshness is tied to the heartbeat cadence: **up to 24h lag** between publishing an
  announcement and it reaching installed apps (heartbeat runs 60s after app launch, then
  every 24h). That's acceptable for this use case — it's not meant to be real-time.

### 2.5 Installer / publisher metadata
The shipped `.exe`'s Windows version resource had **`CompanyName` blank** (missing
`author` field in `EDGE/package.json` — the build log literally warned about this) and
**`LegalCopyright: "Copyright © 2026 Jenix"`** (leftover from an unrelated product,
contradicting `ProductName: EDGEFOLIO`). Fixed: added `author: {name: "IOTSoft", ...}` to
`package.json`, changed `build.copyright` to IOTSoft. Verified via
`(Get-Item $exe).VersionInfo` before/after. Also fixed the same "Jenix" leftover in the
`LoginPage.jsx`/`ActivationPage.jsx` footer copyright text (`© 2026 EDGEFOLIO by Jenix` →
`by IOTSoft`) — **grep for "Jenix" before assuming a match is this bug**; most hits in
this codebase are the legitimate "Jenix OEM" attendance-machine brand integration
(`attendanceController.js`, `ImportModal.jsx`, `u5MachineService.js` — those are correct,
don't touch them).

### 2.6 Real bugs found during testing (not cosmetic)
- **`backend/utils/logger.js` called `path.join()` without ever `require('path')`.**
  Every single log write silently failed with `"path is not defined"`, meaning **no logs
  were ever written to disk in the packaged app** — a real operational blind spot. Fixed;
  verified `server.log`/`sync.log`/`backup.log` now actually appear in
  `%APPDATA%\edgefolio\logs`.
- **`App.jsx`'s boot-time license check silently treated ANY failure as "backend
  offline, proceed anyway"** and fell through to a non-functional login screen with zero
  indication anything was wrong. Reproduced a real (transient) case of this: a freshly
  built installer's backend threw `ENOTDIR` on its very first launch (did not reproduce
  on a second launch of the identical build — most likely Avast actively scanning the
  freshly-written ~90MB of files at that exact moment; see §6). Fixed: `App.jsx` now
  retries the license check up to 5× (1.5s apart) before giving up, and shows an actual
  "Could not start EDGEFOLIO" error screen with a retry button instead of silently
  faking "ok".
- `main.js`'s backend-startup `catch` block now logs `err.stack`, not just `err.message`
  — use this if a similar startup failure needs diagnosing again.

---

## 3. Distribution problem: unsigned installer + Windows/AV trust

This is **unresolved** and will keep causing support friction until addressed.

### 3.1 What happened
A user tried to run a downloaded installer and got *"Windows cannot access the specified
device, path, or file. You may not have the appropriate permissions to access the
item."* — this is antivirus quarantine (confirmed the user's machine runs Avast with
active TLS interception), not a packaging bug. Checksum-verified the hosted file matched
the local build byte-for-byte.

### 3.2 Why (evidence-based, not guesswork)
Compared against a real competitor: a Chinese access-control vendor's `setup.exe`
(`E:\D Manoj PC\56 Gate Controller\LP01\AccessControl20.en\setup.exe`) is **also
completely unsigned** (`Get-AuthenticodeSignature` → `NotSigned`) but apparently causes
no warnings. The difference isn't signing — it's:
1. **Size/shape**: their installer is 248KB (native Win32/Delphi); ours is ~89MB
   (Electron + bundled Chromium + NSIS). Large generic-packed installers are exactly the
   heuristic profile AV engines are tuned to distrust, because that's the cheapest way to
   build a convincing fake installer.
2. **Reputation is earned by volume+age of the exact same file hash**, not just by
   signing. Since ~2020 Microsoft SmartScreen only gives *instant* trust to **EV**
   (Extended Validation) certificates — a standard/cheap cert does **not** skip the
   reputation-building requirement. Their installer has presumably circulated unchanged
   across thousands of installs for years. **Every time we rebuild the EdgeFolio
   installer, the hash changes and the reputation clock resets to zero** — and this
   session rebuilt it multiple times while fixing bugs. Don't rebuild casually; batch
   fixes and rebuild once per release, not per fix.

### 3.3 What was decided (given zero income from this product)
- **No code-signing cert purchased** — not worth ₹20-30k/year for a free project, and a
  standard (non-EV) cert wouldn't even fix the SmartScreen dialog (only EV does).
- **Not yet done**: submitting the current installer hash to Microsoft Defender
  (wdsi/filesubmission) and Avast's false-positive form. Worth doing for the *current*
  hash before it changes again. Both are free, take days-to-weeks to propagate, and don't
  fully solve it for every other AV vendor.
- Considered and **rejected for now**: switching frameworks (Tauri / WebView2 / bundled-
  backend-opened-in-system-browser) to shrink the installer. Would reduce heuristic risk
  somewhat but is a real multi-week rewrite and doesn't fix the reputation-building
  problem either way. Revisit only if install-size/speed becomes its own complaint
  independent of the AV issue.
- On-page mitigation shipped instead: `/onboard`'s success screen and `/download` flow
  include plain-language instructions for clicking through the SmartScreen "More info →
  Run anyway" prompt.

**If this keeps blocking real customers, the actual fix is an EV code-signing
certificate** — that's the only thing that gives instant trust regardless of file-hash
reputation. Revisit if/when there's revenue.

---

## 4. Full install → uninstall test (passed)

Ran the real NSIS installer silently (`/S`), verified, then uninstalled silently (`/S
/allusers`), verified again. Results:

| Check | Result |
|---|---|
| Installs to `C:\Program Files\EDGEFOLIO` (per-machine, all-users — implicit default for `oneClick: false`, not something explicitly configured) | ✅ |
| Registry uninstall entry shows `Publisher: IOTSoft` | ✅ |
| Start Menu + Desktop shortcuts (all-users) | ✅ |
| App launches, no crash (4 processes — normal Electron main/renderer/GPU) | ✅ |
| Uninstaller removes Program Files, shortcuts, registry entry | ✅ |
| No leftover processes | ✅ |
| User data (`%APPDATA%\edgefolio`) preserved (`deleteAppDataOnUninstall: false`) | ✅ (intentional) |
| Empty `Program Files\EDGEFOLIO` folder left behind | ⚠️ trivial NSIS quirk, not a real leftover (confirmed not locked, just wasn't self-deleted) |

**Gotcha discovered during this testing**: because `deleteAppDataOnUninstall: false`
preserves `%APPDATA%\edgefolio` across every reinstall, a **stale admin account from a
build months old** (`admin@edgefolio.com`, created 2026-05-01 — the original seeded
default account, since removed from source) was still sitting in this dev machine's
local SQLite DB and caused a confusing "why is it asking for a password I never set"
report during later end-user testing. This is a **shared-dev-machine testing artifact,
not a real bug** — a genuine customer's clean PC would never have this. If you need a
truly clean test on a reused machine, wipe `%APPDATA%\edgefolio` first.

---

## 5. Installer build & deploy — how to do it

```bash
cd EDGE
npm run build:exe          # produces dist-exe/EDGEFOLIO Setup 1.0.0.exe + portable
```
electron-builder auto-rebuilds `better-sqlite3` for Electron's ABI as part of this —
**don't worry about native-module ABI mismatches**, it's an N-API prebuilt binary and is
ABI-stable across Node/Electron by design (an earlier session hypothesis that this needed
manual rebuilding was a false alarm — see the commit history around 2026-08-11/12 if you
want the full reasoning trail).

Then copy + upload:
```bash
cp "dist-exe/EDGEFOLIO Setup 1.0.0.exe" "VPS/marketing/downloads/EdgeFolio-Setup.exe"
cp "dist-exe/EDGEFOLIO 1.0.0.exe"       "VPS/marketing/downloads/EdgeFolio-Portable.exe"
# then pscp both to root@154.61.69.200:/root/projects/public-credit/edgefolio/VPS/marketing/downloads/
# (these are gitignored via the repo's *.exe rule — always deployed by hand, never via git pull)
```
Verify with `certutil -hashfile ... SHA256` locally vs `sha256sum` on the VPS before
trusting a deploy — this caught a real upload-in-progress race once this session.

**Current live installer**: EdgeFolio v1.0.2, deployed 2026-09-03. `EdgeFolio-Setup.exe`
SHA256 `3226caa7de075a61672d64f479b8cabad944a07956dc38d38eaa3a0885ebd630`;
`EdgeFolio-Portable.exe` SHA256 `ba82693492fb955b80e8710a799ce6c09c4e6645f3bc689bc3b529e9529710d1`.
Built from **uncommitted** working-tree changes on top of commit `06fd67a` — this deploy
shipped the Salary Policy engine, Salary Structure engine, Designations management, and a
long-standing bug fix (`EDGE/backend/services/backupService.js`: `getDataInfo()`/
`buildPayload()` read `require('../../../package.json')`, one directory too high — it
silently threw and fell back to the hardcoded `'1.0.0'` default, so Settings → Data &
Backup always showed v1.0.0 regardless of the real installed version; fixed to
`../../package.json`). **Commit this working tree before the next deploy** so this note
can reference a real commit hash again.

---

## 6. Known environment gotchas (cost real time this session — read before repeating)

- **`/root/projects/pnpm-workspace.yaml` is a shared workspace root spanning many
  unrelated products on the VPS.** Running plain `pnpm install` inside
  `VPS/marketing/` triggers a workspace-wide lockfile check that fails on completely
  unrelated packages (e.g. EDGE's Electron deps, which shouldn't even be relevant to a
  Node.js Express marketing site). **Do not run `pnpm install --no-frozen-lockfile`
  there** — it risks rewriting the shared root lockfile. Instead, for small pure-JS
  dependency additions, build locally and upload a tarball of `node_modules` directly
  (`tar -czf ... node_modules`, `pscp`, extract over the old one). Only safe because none
  of `VPS/marketing`'s deps (`express`, `google-auth-library`, `dotenv`) have native
  bindings.
- **`dotenv.config()` with no `path` option resolves relative to `process.cwd()`, not the
  script's directory.** PM2's `exec cwd` for `edgefolio-marketing` is `/root`, not the
  marketing folder — cost a full debugging cycle when `GOOGLE_CLIENT_ID` silently never
  loaded. Always use `dotenv.config({ path: path.join(__dirname, '.env') })`.
- **The Bash tool's persistent working directory silently resets to the primary project
  root after any command that `cd`s outside it** (e.g. into the sibling `Billing at IOT
  soft` repo). Each such command needs `dangerouslyDisableSandbox: true`, and you must
  `cd` again within the *same* command if you need to run something else there —
  it will NOT persist to the next tool call.
- **Avast is running on the primary dev machine and intercepts TLS** (`curl` needs `-k`
  for local testing against `edgefolio.iotsoft.in` or `api.github.com`, otherwise you get
  a false "SSL certificate problem: unable to get local issuer certificate" — it's Avast's
  own MITM root cert, not a real problem with the target site).
- **The VPS's `plink`/`pscp` wrappers** (`D:\plink_git.bat`, `D:\pscp_git.bat`) have the
  root password embedded — never print their contents, never commit anything referencing
  them, don't cat them.
- **Heredocs (`cat > file << 'EOF'`) do not survive being passed through
  `plink -batch`** — the shell layers mangle them. Write the file locally and `pscp` it
  up instead.

---

## 7. Billing-platform deploy — no git on the VPS

`/var/www/billing-platform` on the VPS is **a plain deployed copy, not a git checkout**
(`git status` there returns "not a git repository"). To deploy a change:

1. Back up first: `cp -r /var/www/billing-platform/src /var/www/billing-platform/public /root/backups/billing-platform-<timestamp>/`
2. `pscp` the changed `src/**/*.js` files individually to matching paths under
   `/var/www/billing-platform/src/`
3. If `billing-client` (the React dashboard) changed: `npm run build` locally (its Vite
   config already outputs straight into `../billing-server/public/`), tar the `public/`
   dir, `pscp` it up, `rm -rf` + extract over the live `public/`
4. `node -c` every changed `.js` file on the VPS **before** reloading, to catch syntax
   errors before they take down a production process serving 16+ other products
5. `pm2 reload billing-platform` (graceful — not `restart`)
6. `curl localhost:3010/health` to confirm

The repo (`billing.git` on GitHub) should still be kept in sync via normal `git push`
for history/review purposes, even though the VPS deploy itself doesn't pull from it.

---

## 8. Outstanding / TODO

- [ ] **Pending: real end-to-end test by the product owner** on a genuinely clean
  machine (this doc was written specifically so that test, and any follow-up work, has
  full context). Update this section with results.
- [ ] Stray test license `EF-B700-9A58-5599-FDE2` ("Test QA Co") in production —
  owner said they'd clean it up via the billing dashboard, unconfirmed if done.
- [ ] AV false-positive submissions (Microsoft Defender + Avast) for the current
  installer hash — not yet submitted.
- [ ] Code-signing certificate — deliberately deferred (§3.3), revisit if revenue exists
  or AV blocking becomes a frequent support issue.
- [ ] `EDGE_TRIAL_MAX_EMPLOYEES` env var is now dead/unused on the VPS's
  `billing-platform/.env` — harmless to leave, but the code no longer reads it.
- [ ] Agent-code-to-Salesman reconciliation (commission attribution) — not built,
  intentionally out of scope; the `Salesman.salesmanCode` model exists if this becomes a
  priority.
- [ ] `electron-updater`'s GitHub Releases mechanism is dormant, not deleted. If a real
  release pipeline is ever set up (`electron-builder --publish always` against an actual
  tagged non-prerelease GitHub Release with `latest.yml` + installer assets attached),
  re-enable the two commented-out lines in `EDGE/electron/updater.js`.
