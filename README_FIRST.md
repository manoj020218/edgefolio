# READ THIS FIRST

**Last updated:** 2026-09-01
**Update rule:** whoever (human or agent) does meaningful work in this project updates
the relevant section of this file **at the end of the session**, before stopping. This
project has had multiple developers/agents work on different pieces without a shared
map — that's how the same "native Kotlin plugin" idea ended up half-built under a
differently-named product (`EMS`), and how `VPS/` shipped a full folder structure with
every file empty. This file exists so that never happens again. If something you did
isn't reflected here, the next session will re-derive it from scratch or contradict it.

---

## 1. What EdgeFolio actually is (business intent)

The client's real ask, reconstructed 2026-09-01 after the plan had drifted across
several separately-built pieces:

1. **A fully offline payroll & attendance app that runs on a Windows PC** ("EDGE"),
   given away **free**, that works with **any make/model of biometric/attendance
   machine** via a bridge/adapter layer — not locked to one vendor.
2. **Field employees can mark attendance from a phone** even when they're not at a
   machine (the APK).
3. The client has **multiple physical locations**. He wants to **monitor all of them
   from one centralized place** using the VPS/cloud — regardless of whether a given
   location runs the free EDGE software locally, or has nothing but a biometric
   machine that pushes straight to the cloud.
4. Everything **local** (EDGE, the machine bridge) stays **free forever**. Everything
   **centralized/cloud** (multi-location monitoring, cloud sync, mobile access) is the
   **paid tier** — that's the business model.
5. The APK should be **React + TypeScript wrapped in Capacitor**, with **small native
   Kotlin plugins only where the OS genuinely requires native code** (camera/liveness,
   background GPS, push, boot recovery) — not a fully native app.

Two products got tangled while multiple people/agents built pieces without this
written down: **EdgeFolio** (payroll/attendance, above) and a separate, unrelated
product called **Jenix FieldForce / EMS** (sales-rep GPS+call+device monitoring for
company-issued phones — its own multi-tenant SaaS, nothing to do with payroll). See
§4 for how to tell them apart and what's shared vs. not.

---

## 2. System map

```
                                   ┌─────────────────────────────┐
                                   │      VPS (cloud, paid)      │
                                   │  154.61.69.200               │
                                   │  - marketing site (live)     │
                                   │  - billing/licensing (via    │
                                   │    external Billing repo)    │
                                   │  - "devicehub" relay          │
                                   │    (DESIGNED, NOT BUILT)      │
                                   │  - monitoring dashboard       │
                                   │    (DESIGNED, NOT BUILT)      │
                                   └───────────┬──────────────────┘
                                               │ outbound HTTP pull/push
                     ┌─────────────────────────┼─────────────────────────┐
                     │                         │                         │
            ┌────────▼────────┐      ┌─────────▼─────────┐     ┌─────────▼─────────┐
            │  EDGE (Windows) │      │  Bridge: S3 U5     │     │  Bridge: C3        │
            │  free, offline  │      │  gateway (HTTP)    │     │  Wiegand (MQTT)     │
            │  DONE, shipping │      │  BUILT, untested   │     │  BUILT, tested       │
            │                 │      │  against EdgeFolio │     │  elsewhere            │
            └────────┬────────┘      └────────────────────┘     └──────────────────────┘
                     │ talks to machines on LAN
            ┌────────▼────────┐
            │ ZKTeco / U5 /   │
            │ M68 machines    │
            └─────────────────┘

            ┌─────────────────┐        ┌───────────────────────────┐
            │  APK (Android)  │        │  EMS backend (Mongo/TS)   │
            │  WRONG TECH —   │        │  built for a DIFFERENT     │
            │  full native,   │        │  product (FieldForce), but │
            │  needs Capacitor│        │  its plugin layer is        │
            │  rebuild        │        │  reusable — see §4          │
            └─────────────────┘        └───────────────────────────┘
```

---

## 3. Component status (verified by reading the actual code, 2026-09-01)

| Component | Path | Status | Notes |
|---|---|---|---|
| **EDGE desktop** | `EDGE/` | ✅ Real, shipping | Electron + React + Node/Express + SQLite. Packaged installer (`npm run build:exe`), distributed from `VPS/marketing/downloads/` via `/onboard` and `/download`. Free-forever licensing shipped 2026-08-14 (see `HANDOFF.md`). **No changes needed** for the machine-bridge requirement — already multi-vendor (see next row). |
| **EDGE machine bridge** | `EDGE/backend/services/zktecoService.js`, `hardware/u5/u5Adapter.js`, M68 integration (`M68_PLAN.md`) | ✅ Real | Generic ZKTeco protocol (covers most cheap machines) + Python `pyzk` fallback, U5 (MQTT/HTTP-poll), M68/WitEasy (device-initiated HTTP push, `FKWebTrans` protocol). This **is** the "universal, any make/model" bridge the client asked for. |
| **VPS marketing site** | `VPS/marketing/` | ✅ Real, live | PM2 `edgefolio-marketing`, port 3080. SEO, `/onboard`, `/download`. |
| **VPS backend (monitoring/APK-hosting/billing-relay)** | `VPS/src/` | ❌ **Empty skeleton** | Every single file in `controllers/`, `models/`, `routes/`, `services/`, `middleware/` is **0 bytes**. Folder structure exists, nothing is implemented. This is the single biggest remaining gap, not "small work." |
| **VPS "devicehub" cloud relay** (multi-location, machine→cloud direct) | Designed in `M68_PLAN.md` §STEP M68-4 | 📋 **Designed, not built** | Full adapter-pattern design already thought through: per-machine-model adapter normalizes punches, `edge_devices`/`edge_punches` Mongo collections, dev_id→tenant binding, pull-based sync (EDGE pulls, nothing needs inbound ports). This is the right design — implement against it, don't redesign. |
| **Billing/licensing platform** | External repo: `D:\IOT Device\Billing at IOT soft` | ✅ Real, live | Shared across 16+ IOTSoft products. Deployed by hand (`pscp`), not git-pulled on the VPS. `EdgeLicense` model, free-forever fields already patched (§2.2 of `HANDOFF.md`). |
| **APK (native, reference only)** | `APK/android/` | ⚠️ Built, wrong tech, not release-ready, **left untouched** | Fully native Kotlin + Jetpack Compose. Works, but client wants React+TS/Capacitor — being superseded by `APK/mobile/` (next row), not deleted. Its face-liveness logic (`LivenessDetectorTest.kt`) is still the reference for the not-yet-built `cap-face-liveness` plugin. |
| **APK (rebuild — React+TS/Capacitor)** | `APK/mobile/` | ✅ **Login verified end-to-end on a real device against real EDGE** | Started 2026-09-01. Vite+React+TS+Tailwind, wired to the real `EDGE/backend/routes/apk.js` contract. `npm install`, `tsc -b`, `vite build`, `./gradlew assembleDebug` all pass; `npx cap sync android` auto-registers all 8 reused/new plugins. Screens done: server-address setup, login (Employee ID or email), forgot-password + HR-admin approval + forced password-change gate, home/today-status, full attendance-marking flow (liveness+face capture → match → GPS → submit), full HR-admin/owner suite (live feed, employees, work assignments, alert subscriptions, analytics, broadcast, password resets). **2026-09-02: real device → real EDGE → JWT → `passwordMustChange` gate confirmed working**, after fixing 4 real bugs along the way (see §8 2026-09-02 entry: EDGE's `127.0.0.1`-only binding, Capacitor's Mixed Content policy blocking plain HTTP, a wrong health-check URL, and — the big one — no employee ever had a way to get app credentials at all). Two of those fixes only exist in source, not yet in the rebuilt packaged EDGE app. **Not done:** attendance history, announcements feed, face-enrollment capture UI, profile/settings, FCM wiring, offline batch-sync. **Not yet tested on-device:** the attendance/liveness flow (needs `mobilefacenet.tflite`, see next row), HR-admin/owner screens, the reused native plugins' actual runtime behavior. |
| **`@jenix/cap-face-liveness` (new plugin)** | `APK/mobile/native-plugins/cap-face-liveness/` | ✅ Compiles clean as part of the app build | New Capacitor plugin, built 2026-09-01, **EdgeFolio-only — deliberately not placed in `EMS/Plugins`** (that workspace is FieldForce-only; see §4). Native Kotlin (`LivenessDetector.kt`, `CameraXManager.kt`, `FaceEmbeddingEngine.kt`) ported near-verbatim from `APK/android`'s already-validated originals — same 2-blinks/5°-head-turn liveness thresholds, same MobileFaceNet TFLite contract. TS side (`similarity.ts`) builds and passes tests. Native side now Gradle-verified: fixed a bad dependency pin (`tensorflow-lite-support:2.14.0` doesn't exist upstream — removed, it was unused dead weight anyway, `FaceEmbeddingEngine.kt` only needs the core `tensorflow-lite` interpreter). Still needs `mobilefacenet.tflite` at `APK/mobile/android/app/src/main/assets/` before face capture actually works at runtime (build succeeds without it; `capture()` will just reject with `MODEL_MISSING`). Simplification vs. native: no face-bounding-box overlay, hint text only — see the plugin's own `README.md`. |
| **EMS backend (Mongo/TS)** | `EMS/src/` | ⚠️ Built for a different product, but architecturally the VPS's future | `Jenix FieldForce` — sales-rep GPS/call/device monitoring, **not payroll**. Its own `BACKEND_HANDOFF.md` says explicitly: *"if another developer owns the deployed VPS Mongo layer, they should merge or port these modules into `VPS/src`."* So EMS is not a rival to VPS — it was built as a candidate implementation for VPS's empty backend, just scoped to the wrong product's domain (calls/visits/dialer instead of payroll/attendance monitoring). `EMS/` (backend) itself still untested this session — only `EMS/Plugins` (below) was retried. |
| **EMS native Capacitor plugins** | `EMS/Plugins/cap-*` | ✅ Build + test pass; now actually consumed | **Correction, 2026-09-01:** the "blocked npm install" in `NATIVE_PLUGINS_HANDOFF.md` was an environment issue, not a code problem — `npm install` + `npm run build` + `npm run test` all pass cleanly now for all 7 plugins. `cap-core`, `cap-device-health`, `cap-location`, `cap-lifecycle`, `cap-push` are now real dependencies of `APK/mobile/` (linked via `file:`, not copied). `cap-dialer`, `cap-device-policy` deliberately **not** reused — FieldForce-only (call capture/MDM, wrong privacy footprint for payroll). See `EMS/Plugins/NATIVE_PLUGINS_HANDOFF.md` 2026-09-01 entry for detail. |
| **Bridge: EDGE Bridge Mini (ESP32-C3, Wiegand)** | `Bridge/edge-bridge-mini-c3/` | ✅ Built and tested (elsewhere) | Universal Wiegand reader → MQTT. Publishes to `edgefolio/v1/{site_id}/{product_id}/{device_id}/{attendance\|status\|heartbeat\|sync}`. Offline ring-buffer, OTA, factory reset, provisioning portal all implemented. Needs an MQTT broker to exist somewhere (VPS or otherwise) — none is deployed yet. |
| **Bridge: ESP32-S3 U5 Gateway** | `Bridge/edge-bridge-u5-s3/` | ✅ Built and tested, **for a different backend** | Copied 2026-09-01 from `D:\IOT Device\Society\Jenix Community One\firmware\` (source project unaffected, this is a copy). Polls U5 terminals over LAN HTTP, forwards to a configurable `push_base_url` (currently defaults to Jenix Community One's `community.iotsoft.in/api/devices/push` — **must be repointed** to whatever EdgeFolio's VPS device-relay endpoint ends up being, per §STEP M68-4). Has a setup wizard, OTA, watchdog, heartbeat, photo-fetch-on-demand. `.pio` build cache (55MB) was **not** copied — regenerates via `pio run`. |
| **Card/RFID → employee mapping** | — | ❌ Missing | `grep` across `EDGE/backend/models` and `migrations` found no `card_id`/`rfid`/`wiegand` field anywhere. The C3 Wiegand bridge sends a `card_id` that nothing today can resolve to an employee. Needed before the Wiegand bridge is useful. |

---

## 4. EdgeFolio vs. EMS/Jenix FieldForce — do not re-merge without reading this

These are **two different products** that got built partly in parallel:

| | EdgeFolio | EMS / Jenix FieldForce |
|---|---|---|
| Who | Fixed-location office/factory staff | Roaming sales reps, company-issued phones |
| Core problem | Payroll + attendance | Live location, visits, call capture, MDM-style device control |
| Local requirement | **Must work fully offline** — this is the entire pitch | Cloud-first, always-online, multi-tenant SaaS by design |

**Recommendation already given and still standing:** don't merge the products. The
offline-first requirement for EdgeFolio's EDGE layer is incompatible with EMS's
always-online multi-tenant Mongo design. **Do** reuse EMS's native Capacitor plugin
*code* (`cap-core`, `cap-location`, `cap-device-health`, `cap-push`, `cap-lifecycle`)
for EdgeFolio's APK rebuild, re-pointed at EdgeFolio's own API contract
(`EDGE/backend/routes/apk.js`) instead of EMS's Mongo API. Leave `cap-dialer` and
`cap-device-policy` behind — those belong only to FieldForce.

---

## 5. Open architecture decisions (need a call before building, not mid-build)

1. **Two device-transport designs currently exist and aren't reconciled — deliberately
   deferred, not forgotten.** Per the client (2026-09-01): both bridges' hardware
   transport is **already tested and working** (tested in their respective source
   projects, not yet re-verified against EdgeFolio's own VPS endpoints). Decision:
   **finish the APK rebuild first, then re-test both bridges end-to-end against
   EdgeFolio**, and reconcile/pick the VPS ingestion protocol at that point — not now.
   - `M68_PLAN.md` §STEP M68-4 designs an **HTTP pull-relay** (`devicehub.iotsoft.in`,
     per-model adapters, EDGE pulls punches).
   - `Bridge/edge-bridge-mini-c3` (tested, elsewhere) **pushes over MQTT** to
     `edgefolio/v1/...` topics.
   - `Bridge/edge-bridge-u5-s3` (tested, elsewhere — copied from Jenix Community One)
     **pushes over plain HTTP POST** to a configurable URL (Jenix Community One's
     contract shape today, must be repointed).
   - These three don't have to become one protocol, but VPS needs to decide: does it
     run an MQTT broker *and* an HTTP relay, or should the C3 bridge's firmware be
     changed to speak the same HTTP relay contract as the S3 gateway and M68 plan?
     **Do not write `VPS/src/services/*` ingestion code until this retest/decision
     happens** — that's scheduled for after the APK work below, not before.
2. **Card/RFID → employee mapping** — where does this live? Probably a new field on
   EDGE's employee model (`EDGE/backend/models`) plus the equivalent on whatever the
   VPS-side tenant/employee record ends up being.
3. **APK rebuild sequencing** — React+TS/Capacitor shell first with the reused EMS
   plugins, or backend (VPS devicehub + monitoring) first? They don't block each other;
   pick based on who's available to work on which.

---

## 6. Known environment gotchas (don't rediscover these)

- `npm install` has failed/timed-out repeatedly in this dev environment for both
  `EMS/` and `EMS/Plugins/` — typecheck/build/test are unverified there. Try on a
  machine with working registry access before assuming the code is broken.
- VPS's `pnpm-workspace.yaml` at `/root/projects/` is **shared across many unrelated
  products** — never run `pnpm install --no-frozen-lockfile` inside `VPS/marketing/`.
  See `HANDOFF.md` §6 for the full list (dotenv cwd gotcha, Avast/TLS interception,
  plink/pscp credential handling, heredocs breaking over `plink -batch`).
- The Electron installer is unsigned and gets flagged by AV heuristics (size/shape,
  not lack of signing) — see `HANDOFF.md` §3. Not fixed; needs an EV cert if it
  becomes a real blocker, deferred until there's revenue.
- `DOCUMENTATION_INDEX.md`, `PROJECT_STATUS.md`, `IMPLEMENTATION_PHASES.md`,
  `PHASE_1_*` docs are all dated **April 2026**, from when EDGE was still a
  frontend-only mock. They describe a 3-phase plan that has since been completed and
  overtaken by real events (EDGE backend built, VPS still stub, APK built then found
  to be the wrong tech, EMS/Bridge added). **Treat them as historical, not current.**
  This file (`README_FIRST.md`) and `HANDOFF.md` are the current sources of truth.
- **`npm run build:exe` can silently produce a corrupted installer** — hit this
  2026-09-02: the packaged `app.asar`'s `node_modules/electron-updater/package.json`
  had the entire MIT `LICENSE` file text prepended before the real JSON, breaking
  `JSON.parse` the moment `electron/main.js` requires `./updater` (which requires
  `electron-updater`) — this throws in the Electron **main process** before
  `app.whenReady()` ever fires, so the symptom is: process launches, sits at ~0% CPU,
  no window content, no backend, **no crash dialog visible if launched detached from
  a terminal** (only appeared when launched via `Start-Process` in this session — a
  double-clicked launch might show it immediately, worth checking first if this
  recurs). The **source** `EDGE/node_modules/electron-updater/package.json` was
  confirmed valid JSON — corruption happened during packaging, not in source. Same
  root-cause family as the `HANDOFF.md` §6 "ENOTDIR on first launch" incident — Avast
  interfering with electron-builder's rapid file I/O while building the asar archive.
  Diagnosis path if this recurs: `EDGE/node_modules/.bin/asar extract <path to
  app.asar> <out dir>` and check `node_modules/electron-updater/package.json` for
  garbage before the `{`. Fix was simply rebuilding — non-deterministic corruption,
  didn't reproduce on the next `build:exe`.

---

## 7. Where to look for more detail

- `HANDOFF.md` — marketing/licensing/distribution, most recent deep-dive (2026-08-14).
- `M68_PLAN.md` — machine-integration protocol details + the VPS devicehub relay design.
- `EMS/BACKEND_HANDOFF.md`, `EMS/Plugins/NATIVE_PLUGINS_HANDOFF.md` — EMS's own status.
- `APK/APK_BUILD_TRACKER.md` — the native APK's (superseded-direction) build checklist;
  still useful for its feature/requirements list, not for its tech choices.
- `Bridge/edge-bridge-mini-c3/README.md`, `Bridge/edge-bridge-u5-s3/README.md` +
  `HANDOFF.md` in that folder — hardware bridge specifics.
- `audit.md` — a point-in-time bug audit (2026-07-08); may contain still-open findings,
  kept at root deliberately (not moved to `STALE/`) since unfixed bugs stay relevant.

### `STALE/` folder
Docs superseded by this file and `HANDOFF.md` — kept for history/context, **not
deleted**, but don't treat them as current instructions:
`DOCUMENTATION_INDEX.md`, `PROJECT_STATUS.md`, `IMPLEMENTATION_PHASES.md`,
`PHASE_1_SUMMARY.md`, `PHASE_1_CHECKLIST.md`, `PHASE_2_PLAN.md`,
`PHASE_2_IMPLEMENTATION_CHECKLIST.md`, `PHASE_2_QUICK_START_GUIDE.md`,
`LICENSING_PLAN.md` (describes the pre-free-forever 6-month-trial model — reversed,
see `HANDOFF.md` §2.2), `DEVELOPER_QUICKSTART.md` (Phase-1/mock-data era). If you're
tempted to read one of these for "how do I get started" or "what's the plan," read
this file and `HANDOFF.md` instead — they were moved here specifically because they
now disagree with reality.

---

## 8. Session log (append, don't rewrite history)

### 2026-09-01
- Investigated actual state of EDGE, VPS, APK, EMS, EMS/Plugins by reading code (not
  just docs) — found `VPS/src/*` is 100% empty (every file 0 bytes), APK is native
  Kotlin/Compose (client wanted Capacitor), EMS backend/plugins built for a different
  product but explicitly intended as VPS's implementation reference.
- Copied `D:\IOT Device\Society\Jenix Community One\firmware\` →
  `Bridge/edge-bridge-u5-s3/` (excluded `.pio` build cache). Source project untouched.
- Found and read the existing VPS devicehub relay design (`M68_PLAN.md` §STEP M68-4) —
  it already solves "multi-location, no-EDGE-site" cleanly; don't redesign it.
- Created this file. No code changes made to EDGE, VPS, APK, or EMS yet.
- Client confirmed both bridges' transport is already tested/working — decision made
  to defer the device-transport reconciliation (§5.1) until **after** the APK rebuild,
  then re-test both bridges against EdgeFolio directly.
- Moved 10 superseded planning docs into new `STALE/` folder via `git mv` (history
  preserved, nothing deleted) — see §7. Root now only carries current-truth docs:
  `README.md`, `README_FIRST.md`, `HANDOFF.md`, `M68_PLAN.md`, `DESIGN_SYSTEM_GUIDE.md`,
  `audit.md`.
- **APK rebuild started:** new `APK/mobile/` — Vite+React+TS+Tailwind+Capacitor,
  wired to the real `EDGE/backend/routes/apk.js` contract. `APK/android` (native
  Kotlin/Compose) left in place, untouched — not deleted, kept as reference per
  explicit instruction.
- Along the way, retried `npm install` in `EMS/Plugins` (previously logged as blocked)
  — it now works. Built + tested all 7 plugins successfully, then added them as real
  dependencies of `APK/mobile` and ran `npx cap add android`, which auto-registered
  all 5 reused plugins correctly. Updated `EMS/Plugins/NATIVE_PLUGINS_HANDOFF.md` with
  this. This is the first time any of these plugins have been wired into a real host
  app.
- Verified so far: `npm install`, `tsc -b`, `vite build` in `APK/mobile` all pass;
  `npx cap add android` succeeds. **Not verified:** an actual Gradle/on-device build —
  no Android SDK in this dev environment. Run
  `cd APK/mobile && npx cap sync android && cd android && ./gradlew assembleDebug`
  on a machine with Android Studio to check that next.
- Screens built: server-address setup, login (empCode → password), home/today-status.
  Not built yet: the attendance-marking flow itself (blocked on a new
  `cap-face-liveness` plugin that doesn't exist — port the algorithm from
  `APK/android/app/.../LivenessDetectorTest.kt`), HR-admin/owner screens, FCM, offline
  sync.
- **Client chose:** build the face-liveness plugin + attendance flow next. Done:
  - New plugin `@jenix/cap-face-liveness` at `APK/mobile/native-plugins/` (not in
    `EMS/Plugins` — deliberately kept out, this plugin is EdgeFolio-only). Ported
    `LivenessDetector.kt`, `CameraXManager.kt`, `FaceEmbeddingEngine.kt` near-verbatim
    from `APK/android`'s already-validated native code; face-matching (cosine
    similarity) moved to TS (`similarity.ts`, tested — 6/6 pass) since it's a cheap
    dot-product not worth a native bridge call.
  - `APK/mobile/src/pages/AttendancePage.tsx` — full flow: fetch reference embedding
    (`GET /apk/faces/:empId/embedding`) → `FaceLiveness.capture()` → cosine match →
    `@jenix/cap-location`'s `getCurrentLocation()` (with permission check/request,
    which `getCurrentLocation()` itself does **not** do) → `POST /apk/attendance`.
    Wired into `HomePage.tsx`'s "Mark Attendance" button.
  - `npx cap sync android` now registers **6** plugins including the new one. `tsc -b`
    and `vite build` both pass with the new code.
  - **Not done / next:** an actual Gradle build to catch native compile errors (no
    Android SDK here — do this first on a real dev machine before anything else), the
    `mobilefacenet.tflite` model file needs sourcing (never existed in this repo,
    same gap `APK/android` already had), and a real on-device test of the whole flow.
    After that: FCM and offline batch-sync are still unbuilt.
- **HR-admin/owner screens built** (all under `APK/mobile/src/pages/admin/`, shared
  between both roles with action buttons gated by `user.role === 'hr-admin'` — matches
  the backend's own permission split, e.g. owner sees but can't edit employees/
  assignments): `AdminShell` (bottom-nav layout), `LiveFeedPage`, `EmployeesPage`,
  `AssignmentsPage` (list + create/delete), `AlertsPage` (subscribe/unsubscribe to a
  colleague's check-in/out), `AnalyticsPage` (7-day trend + department breakdown),
  `BroadcastPage`. Routed via `/admin/*` in `App.tsx`, role decides `/` → `HomePage` vs
  `Navigate to /admin`. `tsc -b`, `vite build`, `npx cap sync android` all still pass
  (8 plugins registered — unchanged, admin screens are pure React/TS, no new native
  code).
- **Still backlog, not built:** attendance history (employee), announcements feed
  (employee read view), face-enrollment capture (HR-admin, would reuse
  `cap-face-liveness`), profile/settings screen, FCM token registration wiring,
  offline batch-sync wiring.

### 2026-09-01, later — first real Gradle build, `BUILD SUCCESSFUL`

Found the Android SDK actually exists on this machine at
`%LOCALAPPDATA%\Android\Sdk` (android-34, build-tools 34.0.0 both present, matching
`compileSdk 34`) — just wasn't exported as `ANDROID_HOME` in this shell. Added
`APK/mobile/android/local.properties` (gitignored, standard) pointing `sdk.dir` there
and ran `./gradlew assembleDebug` for real. Took 3 attempts, found 2 genuine bugs:

1. **`tensorflow-lite-support:2.14.0` doesn't exist upstream** (that artifact uses its
   own `0.4.x` versioning, unlike core `tensorflow-lite`). Fixed by removing the
   dependency from `cap-face-liveness/android/build.gradle` entirely — turned out to
   be unused dead weight, `FaceEmbeddingEngine.kt` never imports anything from it.
2. **`cap-device-health`, `cap-location`, `cap-push`, `cap-dialer` (all in
   `EMS/Plugins`) import `com.jenix.cap.core.*` but never declared the Gradle
   dependency on `cap-core`'s Android module** — a real, pre-existing bug in
   FieldForce's plugin workspace, invisible until now because no host app had ever
   compiled these together (exactly what `NATIVE_PLUGINS_HANDOFF.md` predicted). Fixed
   by adding `implementation project(':jenix-cap-core')` to each. First 3 verified by
   actual compile; `cap-dialer` fixed by inspection only (same bug, not in
   `APK/mobile`'s dependency graph so not compiled here) — flag this to whoever next
   touches FieldForce.

Third attempt: `BUILD SUCCESSFUL`, 315 tasks, produced
`APK/mobile/android/app/build/outputs/apk/debug/app-debug.apk` (~58MB). This is real
evidence the whole plugin-reuse architecture (§4) actually works end-to-end, not just
"registers correctly." **Not yet done:** installing/running it — no device or emulator
available in this environment. Face capture specifically will still fail at runtime
(`MODEL_MISSING`) until `mobilefacenet.tflite` is sourced; everything else in the APK
should actually run once installed.

### 2026-09-01, later still — installed and running on a real device

Client connected a physical phone (`2251eb032a78` — same device `adb` ID referenced in
`EMS/Plugins/NATIVE_PLUGINS_HANDOFF.md`'s earlier plugin validation). `adb` connection
was very unstable (`device`/`offline` flapping, survived server restarts and a cable
swap, actually fixed by switching to a different USB **port** on the PC — not the
cable) — worth remembering if this happens again on this machine.

Once connected, `adb install -r app-debug.apk` succeeded (`Success`), replacing an
existing `in.iotsoft.edgefolio` install already on the device. Launched via
`adb shell am start` — confirmed via `dumpsys activity` that `MainActivity` became the
focused foreground app (no crash), and the client visually confirmed the app shows the
**server address setup screen** (`ServerSetupPage.tsx`) correctly on first run, exactly
as designed (no `baseUrl` configured yet). This is genuine first real-device
confirmation that the whole stack works: Capacitor shell, bundled React/Tailwind UI,
and app launch, all verified beyond compile-time.

Not yet tested on-device: login (needs a real EDGE server reachable on the same LAN to
point the IP/port screen at), the attendance/liveness flow (also needs
`mobilefacenet.tflite`, still not sourced), HR-admin/owner screens, any of the reused
native plugins' actual runtime behavior (location, push, device-health, lifecycle).

### 2026-09-02 — full login flow verified end-to-end on a real device; 3 real bugs found

Client tried logging in against a real running EDGE instance. Nothing worked at first —
three genuinely separate bugs, found and fixed one at a time by actually debugging each
(not guessed): **read this before touching connectivity/login again**, all three are
easy to reintroduce.

1. **EDGE only ever listened on `127.0.0.1`** (`EDGE/backend/config/app.js` `HOST`
   default) — a phone on the LAN could never reach it, full stop, regardless of
   firewall or network. Changed the default to `0.0.0.0`. The already-running
   **packaged** EDGE app doesn't pick this up until rebuilt+reinstalled — for
   immediate testing it was restarted with a `HOST=0.0.0.0` env var override
   instead (temporary; reverts on a normal restart until the app is rebuilt).
   Windows Firewall was already fine (an `EDGEFOLIO` inbound-allow rule for all
   TCP/UDP already existed) — that was never the blocker.
2. **Chromium Mixed Content, not Android's OS-level cleartext block.** Capacitor
   serves the app's own UI over a virtual `https://localhost` origin by default;
   the WebView then refuses any plain `http://` fetch as insecure content on an
   "HTTPS page" — confirmed via `adb logcat`, exact message: `Mixed Content: ...
   must be served over HTTPS`. This is a **different** mechanism from the
   `network_security_config.xml` cleartext exception added earlier in this
   session (that one's still correct/needed for native-level blocking, just
   wasn't the actual cause here). Fixed with `server: { androidScheme: 'http' }`
   in `capacitor.config.ts` — matches the origin scheme to the target scheme so
   Mixed Content no longer applies. **This is the fix that actually mattered.**
3. **`ServerSetupPage.tsx` itself had a bug**, found and fixed earlier same day:
   its health check hit `/api/v1/health` (behind `requireAuth`, always 401s) —
   the real public health check is plain `/health`. Fixed to call the correct
   root-level endpoint.
4. **No employee had a working password, and there was no way to create one.**
   Traced through the whole backend: the *only* place that ever creates a
   `users` login row was `authController.js`'s one-time first-run desktop-admin
   `setupHandler` — nothing ever provisioned per-employee app credentials, so
   every seeded/imported employee was permanently locked out of the APK, forever,
   by design gap (not a regression). Fixed `patchEmployeeHandler` in
   `apkController.js`: enabling mobile login for an employee with no `users` row
   now auto-creates one with a generated temp password (same pattern as the
   password-reset flow), returned once in the response for HR-admin to relay —
   wired into `EmployeesPage.tsx`'s existing toggle. For immediate testing (this
   fix also isn't live in the packaged app yet), created EMP001's account by
   hand via a Python script writing directly to the live SQLite DB — verified
   byte-for-byte against Node's own `crypto.scryptSync` output before touching
   anything real, so the temp password it set (`TMP#EMP001`) works exactly like
   one the real code path would generate.

Login confirmed working end-to-end: real device → real EDGE backend → JWT issued →
`passwordMustChange` gate triggered correctly.

**Outstanding: two real fixes exist only in the source repo, not in the running
packaged EDGE app** — the `HOST=0.0.0.0` default and the account-auto-creation on
mobile-login-enable. Both currently rely on the manual workarounds above (env var
override, hand-written DB row) that won't survive a normal EDGE restart. Rebuilding
and reinstalling the packaged app (`npm run build:exe` per `HANDOFF.md`) makes both
permanent — not yet done, pending the client's go-ahead since it touches the live
installer.

### 2026-09-02, later — full employee-side feature set: Requests, Expenses, Visits, Help, Documents

Client approved role-adaptive Work tab (§ mockup decision) and asked to build all of
it for real — "deliver Employee side APP work as done" — before starting HR-side
approval screens next. This was a large addition; full plan was posted in-chat first
(6 phases: profile fields → unified Requests → Documents → Help/HR → Work/Visits →
Home rebuild), then built in that order.

**New backend (`EDGE/backend`):**
- `config/database.js`: 10 new nullable `employees` profile columns (gender, DOB,
  blood group, anniversary, addresses, vehicle, emergency contact), a new
  `is_field_employee` flag (decides what the Work tab shows — HR-admin toggle UI is
  next-phase work, the column just needs to exist now), and four new tables:
  `employee_requests` (unified — one `type` enum for all 9 request kinds, a
  `details_json` blob for type-specific fields rather than 9 different schemas),
  `employee_visits`, `support_tickets` (employee_id nullable for anonymous
  grievances), `employee_documents` (employee_id NULL = company-wide).
- New `UPLOADS_DIR` config constant (`config/app.js`), same pattern as `FACES_DIR` —
  bill photos, visit photos, and self-uploaded documents all land under it, base64
  JSON payloads decoded server-side (matching `faceController.js`'s existing pattern,
  not a new multipart/multer path).
- New controllers/routes: `requestsController`/`routes/requests.js`,
  `visitsController`/`routes/visits.js`, `supportController`/`routes/support.js`,
  `documentsController`/`routes/documents.js` — all mounted under `/apk/*` (reusing
  its `requireAuth`+`requireLicense` gate), all scoped to the calling employee's own
  `empId` from the JWT, never trusting a client-supplied employee id.
- Extended `apkController.js`: `GET/PATCH /apk/profile`, `GET /apk/payslips`,
  `GET /apk/attendance-history`, `GET /apk/leave-balance` — all **new, narrowly-scoped
  endpoints**, deliberately not just proxying the desktop `/payroll/payslips` or
  `/leaves` endpoints, which return every employee's data unfiltered and would leak
  everyone's payslips/leave records to any mobile employee session that called them.
- `getTodayStatusHandler` now also returns `todayAttendance` (check-in/out/hours) so
  Home can show real status, not just work type.
- `apkLoginHandler`'s JWT/response now includes `isFieldEmployee`.

**Known architectural debt, flagged not fixed:** `employee_requests` type `'leave'`
duplicates functionality that already exists in `leave_requests`/`leave_balances`
(pre-existing desktop tables with their own approve/reject endpoints already built —
found while researching this, see `controllers/leaveController.js`). Did **not**
merge them — that needs a real decision (migrate the unified type to write into
`leave_requests`, or retire the desktop leave screens in favor of the unified one)
and touching the existing desktop leave flow felt like the wrong call to make
silently mid-feature. Whoever builds HR-side request approval next must decide this
first, or HR will end up watching two separate "pending leave" lists.

**New frontend (`APK/mobile/src/pages/employee/`)** — this whole folder is new; the
employee side previously had one flat `HomePage.tsx` with no sub-navigation:
- `EmployeeShell.tsx` — new 4-tab bottom nav (Home/Work/Requests/Profile), replacing
  the single-page employee experience.
- `HomePage.tsx` (rewritten) — real check-in status, pending-request count, leave
  balance, latest announcement, next holiday — all live data, not mockup placeholders.
- `RequestsPage.tsx` + `NewRequestPage.tsx` — one adaptive form (`requestTypes.ts`
  config) drives all 9 request types instead of 9 bespoke screens; expense's bill
  photo goes through a real file input → base64 → server-side disk write.
- `WorkPage.tsx` — role-adaptive per `user.isFieldEmployee`; field employees get
  `NewVisitPage.tsx` + `VisitDetailPage.tsx` (the latter has a **real** canvas-based
  signature pad, not a decorative squiggle — pointer events, exports PNG base64).
- `ProfilePage.tsx`, `DetailProfilePage.tsx`, `PaySettingsPage.tsx`,
  `DocumentsPage.tsx`, `HelpSupportPage.tsx` — all real, all wired to the new
  endpoints above. (These only existed as visual mockups before this entry — no real
  code existed for any of them.)
- `lib/api.ts` gained a third client, `rootApiGet`, for endpoints that live at plain
  `/api/v1/*` (announcements, holidays) rather than under `/apk` or `/auth`.
- `ChangePasswordPage.tsx` now takes an optional `onDone` prop so it works both as
  the forced first-login gate and as a normal voluntary `/change-password` route
  from Profile.
- Deleted `src/pages/HomePage.tsx` (the old top-level one) — fully superseded by
  `pages/employee/HomePage.tsx`, confirmed zero remaining imports before removing.

**Not done / explicitly deferred:** payslip PDF download (the UI has the button, no
backend endpoint generates/serves an actual PDF yet), company-wide document upload
(HR-admin uploading policies/appointment letters — `employee_documents` supports it
via `employee_id IS NULL`, just no HR-side UI/endpoint yet, self-upload only for
now), the `is_field_employee` HR-admin toggle (column exists, no admin UI to set it
yet — every employee defaults to office/non-field until HR-side work adds this).

**Verification status:** `tsc -b`, `vite build`, `npx cap sync android`, and the
Gradle debug build all pass. Backend: every new/changed file `node -c` clean;
full new-table DDL verified by applying it to a scratch copy of the **real** live
database (WAL+SHM sidecars included — a plain file copy without them silently
produces an unreadable DB, hit this once, worth remembering) and round-tripping an
insert/select.

**Leave unification, same session:** client asked directly whether `leave_requests`
(existing desktop) and the new `employee_requests` type `'leave'` were the same or
different, and to keep EDGE undisturbed if EDGE's version was already better. They
were different (duplicated). Fixed by making the APK's 'leave' request type
delegate to the existing `createLeaveRequest`/`listLeaves` (`models/leave.js`)
instead of writing its own row — `requestsController.js`'s `listRequestsHandler`
now merges both sources for the unified "My Requests" list. **Zero changes to
EDGE's existing leave code** — desktop HR's leave approval screen (already built,
untouched) is now also the approval path for leave requests submitted from the
APK. Added a leave-type selector (casual/sick/annual, matching `leave_balances`'
columns) to `NewRequestPage.tsx` to support this.

**EDGE rebuilt, reinstalled, and confirmed running with this session's code —
first time all session.** Getting here took real debugging, not just
"rebuild and it worked": the first `build:exe` produced a **corrupted asar** —
`node_modules/electron-updater/package.json` had the full MIT `LICENSE` text
prepended before the JSON, which threw an uncaught SyntaxError in the Electron
**main process** (via `main.js`'s unconditional `require('./updater')`) before
`app.whenReady()` ever fired — symptom was a launched-but-inert process (~0% CPU,
no window, no backend, no crash dialog unless launched via `Start-Process`) that
looked exactly like a hang. Proved this wasn't the new backend code's fault by
running `backend/index.js` directly under Electron's own Node runtime
(`ELECTRON_RUN_AS_NODE=1`) against both a dev DB and the **actual** production
database — both started cleanly in ~2 seconds. Full gotcha + diagnosis recipe in
§6. Fix was a second `build:exe` (non-deterministic corruption, didn't recur) —
confirmed via `curl` on both `127.0.0.1:7001` and the LAN IP (`192.168.1.211`)
after reinstalling. **Not yet done:** reinstalling the new APK on the phone and a
full click-through retest of the whole employee-side feature set built this
session (phone was disconnected at the point this was written).

### 2026-09-02, later still — reinstalled on phone; bottom-nav safe-area fix; nav verified working

Phone reconnected (`2251eb032a78`). Installed the latest debug APK and relaunched —
confirmed via screenshot that the real (not mockup) Home dashboard renders correctly
with live data (greeting, check-in status, leave balance, pending-task count).

Client reported the bottom nav sits too close to the phone's own system nav
buttons. Fixed in both `EmployeeShell.tsx` and `AdminShell.tsx`: the `<nav>` now
gets `paddingBottom: env(safe-area-inset-bottom, 0px)` and `<main>` gets a matching
extra bottom padding so content doesn't hide behind the taller bar
(`index.html` already had `viewport-fit=cover`, required for `env()` to resolve —
no other change needed there). Verified visually on-device after rebuild: clear gap
now exists between the tab bar and the phone's 3-button system nav row. Confirmed
by grep that these two shells are the only fixed-bottom elements in the app — no
other screen has a floating action bar that needed the same treatment.

While retesting, chased down what looked like a navigation bug (tapping "Requests"
appeared to leave the screen unchanged) — this was **not a real bug**: the earlier
tap used displayed-screenshot pixel coordinates directly instead of scaling by the
device's actual resolution ratio (screenshot shown at 878×2000, real device
1080×2460, ×1.23), so the tap landed on the wrong tab. Retried with corrected
coordinates — Requests tab navigates correctly and shows the real request-type
grid **plus a genuine pending leave request** (`sick Leave — 2026-04-25`) fetched
through the newly-merged `listRequestsHandler`, confirming the leave-delegation fix
from the previous entry works end-to-end on a real device against real data, not
just in a scratch-DB check.

**Still pending, unchanged from previous entry:** payslip PDF download, company-wide
document upload UI, `is_field_employee` HR-admin toggle UI. Employee-side feature
set is otherwise functionally complete and now verified on a real device. Next:
HR-side leave/request approval screens (per client's explicit sequencing —
employee side, then HR-admin, then Accounts, then Owner).

### 2026-09-02, later still — face model sourced (wrong spec fixed); real ALOG parser bug fixed and shipped

**Face-liveness model:** the `mobilefacenet.tflite` this repo's docs pointed at
(`[1,112,112,3] -> [1,128]`, INT8) does not exist anywhere findable — verified by
actually downloading and inspecting the real, widely-mirrored public
"MobileFaceNet.tflite" (sirius-ai lineage, e.g.
syaringan357/Android-MobileFaceNet-MTCNN-FaceAntiSpoofing) with a flatbuffer
parser: it's `[2,112,112,3] -> [2,192]` float32 (a pairwise export, batch=2
required by the graph). Rather than keep hunting for a file matching stale specs,
adapted the real code to the real model: `FaceEmbeddingEngine.kt` now duplicates
the same image into both batch slots and reads row 0 of a 192-dim output;
`apkController.js`'s `saveEmbeddingHandler` validation and `database.js`'s column
comment updated from 128→192 to match. Also fixed a real bug found along the way:
`android/app/.gitignore`'s `mobilefacenet.tflite` pattern had a duplicate `app/`
prefix (that file already lives inside `app/.gitignore`) and never actually
matched — fixed. `tsc -b`, `vite build`, `gradlew assembleDebug` all pass;
installed on-device, launches clean, plugin registers with no crash.

**Found while wiring this up, not yet built:** there is no face-enrollment path
at all — no HR-admin capture UI, and the `/faces/:id/enroll` endpoint referenced
in `saveEmbeddingHandler`'s own 404 message doesn't exist in `routes/apk.js`. So
even with the model fixed, no employee has a reference embedding and none can be
created yet. Client's direction on this (verbatim intent, not yet built):
enrollment should happen via the **employee's own phone** (self-capture), not HR
taking photos — raw face data should stay on-device, only the derived embedding
ever leaves it (already true of the existing on-device TFLite pipeline). HR
should be able to check enrollment status from **EDGE desktop**, not trigger
capture itself. Investigated the desktop side before parking this: EDGE already
has a **separate, pre-existing** face system for the office biometric machine —
`GET/POST /api/v1/faces/:id/status|enroll` (`faceController.js`), which stores
3 angle photos (front/left/right) on disk and computes `status` from those flags
— sharing the same `face_enrollments` table but different columns
(`angle_front/right/left` vs. `embedding_json`). Any self-enroll endpoint must
not blindly overwrite the shared `status` column using desktop's
angle-count-based semantics, or the desktop status button will show misleading
results. Not designed or built yet — paused mid-investigation for the ALOG bug
below; resume by designing the self-enroll endpoint + status semantics before
writing code.

**Real ALOG attendance-import bug, fixed and shipped to the affected user.** A
client sent a real device export (`AGL_001.TXT`, 653 punches, 21 employees) that
EDGE couldn't import at all. Three real bugs in `alogService.js`, all found by
actually running the parser against the real file, not guessing:
1. **Fatal:** the date regex only accepted `YYYY-MM-DD`; this device exports
   `YYYY/MM/DD`. Every line failed to match → 0 records → "No valid punch records
   found in ALOG file". This was the reported symptom.
2. Employee name was silently read from the wrong column — this device's export
   has two blank filler columns (after EnNo, after Name) that the parser's
   fixed-position destructuring didn't account for, so `name` always came out
   blank and `mode`/`inOut` were reading GMNo's value instead.
3. This device doesn't report per-punch direction at all (`Type`/`Action`
   columns are constant across all 653 rows, not an in/out signal) — the old
   code still guessed a direction from the wrong column, which would have
   classified every punch as "in" and produced zero checkouts even after fixing
   the date.

Fixed properly, not patched around this one file: `alogService.js` now maps
columns **by header name** instead of fixed position (robust to any column
layout/order, which is what "designed for any make/model machine" actually
requires — client's explicit framing), accepts both `-` and `/` date
separators, and leaves `direction: null` honestly when a device doesn't report
one. Fixed `machineImportModel.js`'s `commitMappedRecords` grouping to treat a
null direction as "candidate for both first-in and last-out" (min/max of all
punches that day) instead of silently dropping punches with no direction —
verified this doesn't change behavior for devices that DO report real direction
(Jenix-format imports use `record_type: 'daily'`, never hit this path at all).

Verified against the real file end-to-end: 653/653 records parsed, correct
names, dates normalised to ISO, and a real multi-punch case (employee 14, 8
punches on 2026-08-14) correctly grouped to checkIn=12:04/checkOut=18:38. Real
file kept locally as a regression fixture
(`EDGE/backend/services/__fixtures__/alog-k43-sample.txt`, gitignored — it's a
real client's employee names/timestamps, not committed) with a small check
script (`EDGE/scripts/verify-alog-parser.js`) that reruns the parser against it.

**Shipped:** rebuilt (`npm run build:exe`) and silently reinstalled
(`EDGEFOLIO Setup 1.0.0.exe /S`) over the local `C:\Program Files\EDGEFOLIO`
install, confirmed clean restart (all 6 schedulers, MQTT broker, `/health`
200). **Auto-update is not live** — `electron/updater.js` has the full
`electron-updater`/GitHub-Releases wiring built, but `checkForUpdates()` is
commented out because no GitHub Release has ever been published (version has
sat at `1.0.0` since the start). Getting a fix to any *other* installed copy
right now means the same manual rebuild+reinstall — there is no live update
channel yet. Standing up a real release pipeline is separate, deliberately
deferred work (needs a GitHub token and a real versioning discipline going
forward) — flagged to the client, not started.

### 2026-09-02, later still — manual "Check for Updates" + marketing site distribution

Two more real bugs/gaps found and closed while shipping the ALOG fix out to the
client:

1. **Auto-match machine ID → employee by name.** Client pointed out the machine
   file already sends the employee's name (now correctly extracted, per the
   parser fix above) — HR shouldn't have to manually re-pick from a dropdown
   for an obvious exact match. `ImportModal.jsx`'s `MachineImportTab` now
   builds a name→employeeId index from the already-fetched employee list and
   pre-fills the mapping dropdown for any `machine_name` that matches **exactly
   one** employee (case/whitespace-insensitive); ambiguous or no-match rows are
   left blank for manual review — no backend change needed, both `unmapped` and
   `employees` were already in the frontend's state. A "✓ matched" badge shows
   which rows were auto-filled; editing one manually clears its badge.

2. **No real update-delivery mechanism**, and the client explicitly does NOT
   want electron-updater's silent auto-download/auto-install model (matches the
   dormant `updater.js` code, still left disabled) — wants a manual,
   user-initiated "Check for Updates" button that hands back a download link,
   with an explicit backup-then-uninstall-then-reinstall instruction rather
   than an in-place silent replace. Built:
   - `electron/main.js`: new `check-for-update` IPC handler — fetches
     `https://edgefolio.iotsoft.in/version.json` (plain static JSON, no auth,
     served by the marketing site's existing `express.static`), compares
     semver against `app.getVersion()`, returns
     `{updateAvailable, latestVersion, downloadUrl, notes}`. Never downloads or
     installs anything itself.
   - `electron/preload.js`: exposes it as `window.electronAPI.checkForUpdate()`.
   - `SettingsPage.jsx` (Data & Backup tab, next to Backup & Restore
     deliberately): new "Check for Updates" card — button, result state, and
     when an update is available, explicit numbered instructions (backup →
     uninstall current → install new → restore backup) plus a download link.
   - Bumped `EDGE/package.json` to `1.0.1` (first version bump ever — was
     `1.0.0` since the start).

**Deployed, not just built:** rebuilt (`npm run build:exe`), reinstalled
locally (`/S` silent), confirmed clean restart. Investigated the actual
marketing site on the VPS (`edgefolio-marketing`, PM2, `/root/projects/
public-credit/edgefolio/VPS/marketing/`, public at
`https://edgefolio.iotsoft.in`, proxied via nginx) — `server.js` already
serves fixed-filename downloads (`/download` → `downloads/EdgeFolio-Setup.exe`,
`/download/portable` → `downloads/EdgeFolio-Portable.exe`) via
`express.static`, so no server code changes were needed, just files: uploaded
the new 1.0.1 installers under those same fixed filenames (`pscp`) and a new
`version.json` (`{version, notes, downloadUrl}`) to the marketing site's root,
where the existing `express.static(__dirname)` line serves it automatically at
`/version.json`. Verified live: `curl https://edgefolio.iotsoft.in/version.json`
returns the new JSON, `/download` and `/download/portable` content-lengths
match the new files exactly.

**Same launch flakiness as the earlier documented incident recurred twice more
while testing this** (single inert process, "Not Responding", ~35MB, no
backend log) — ruled out a regression by (a) confirming the packaged
`electron-updater/package.json` was NOT corrupted this time (targeted
`asar extract-file`, clean content) and (b) running the packaged
`backend/index.js` standalone under `ELECTRON_RUN_AS_NODE` against the real
production DB, which started perfectly in ~3 seconds both times. A second
launch attempt succeeded both times. This is now twice confirmed
non-deterministic and unrelated to any code change in this repo — worth
remembering next time it looks like a real regression: retry once before
assuming a bug was introduced, and if it recurs often it may be worth
investigating on its own (AV scan interference is the leading suspect, never
confirmed).

### 2026-09-02, later still — self-enroll face capture endpoint; real client-driven Machine Import redesign

**Self-enroll face capture, designed and built.** Picks up the enrollment gap
flagged two entries back. Client's direction: capture stays on the employee's
own phone (raw photos never leave the device — only the derived embedding
does, already true of the existing TFLite pipeline), HR only ever *checks*
status from EDGE desktop, never captures on someone's behalf.

- New DB column `face_enrollments.embedding_enrolled_at`, deliberately
  separate from the desktop's own `updated_at`/`status`/`angle_*` columns
  (those belong to a **different, pre-existing subsystem** — the office
  biometric machine's 3-angle photo enrollment, `faceController.js`, which
  happens to share this table). Self-enroll never touches those columns.
- `POST /apk/faces/self-enroll` (new, no role gate beyond being a logged-in
  APK employee, always writes to the caller's own `empId` from the JWT) —
  creates the `face_enrollments` row if this is the employee's first
  enrollment of any kind, or just updates `embedding_json`/
  `embedding_enrolled_at` if a row already exists from the desktop side.
- `GET /apk/faces/self-enroll` — own status only (`{enrolled, enrolledAt}`),
  deliberately never returns the raw embedding vector to a UI layer.
- Fixed two real bugs in the existing `GET /apk/faces/:empId/embedding` found
  while doing this: it gated readiness on the desktop's photo `status`
  (`complete`), which would have permanently blocked a phone-only-enrolled
  employee's own attendance capture forever since photo status has nothing to
  do with the phone embedding; and it had **no ownership check at all** — any
  authenticated APK employee could read any other employee's biometric
  embedding by changing the URL param. Both fixed: readiness now checks
  `embedding_json` directly, and a non-owner request now needs hr-admin/owner.
- Desktop's `GET /api/v1/faces/:id/status` (`faceController.js`) extended
  additively with `embeddingEnrolled`/`embeddingEnrolledAt` — the angle/status
  fields are completely unchanged. **Not yet done:** no desktop UI actually
  surfaces this anywhere (confirmed by grep — `faceController.js`'s endpoints
  have zero frontend callers, always have). HR currently has no on-screen way
  to see it; adding a "Face ID" tab to `EmployeeDrawer.jsx` is the natural next
  step, not built this session.
- Mobile: new `pages/employee/FaceEnrollPage.tsx` (linked from Profile → "Face
  ID"), and `AttendancePage.tsx`'s dead-end "contact HR" message on
  `NOT_ENROLLED` now links to it instead. `tsc -b`/`vite build` pass.
- Verified the migration against a scratch copy of the real DB (established
  pattern this session) — `embedding_enrolled_at` column confirmed added
  cleanly.

**Real client feedback reshaped Machine Import significantly, same session:**

1. Client (real user testing, not hypothetical): "why do I have to
   double-enter a name the machine already sent me" → built name-based
   auto-match (previous entry) — but then reported it wasn't showing anything
   at all on a real device file. Debugged with hard numbers against their
   *live* production DB (checkpointed the real WAL directly, not a guess):
   `employees` = 0 rows, `attendance_records` = 0, `machine_import_staging` =
   3,918 (their file staged 6 times while retesting). **Root cause: they
   hadn't added any employees to EDGEFOLIO yet** — auto-match had nothing to
   match against, which is correct behavior, not a bug. Also separately
   diagnosed and explained: they were looking at a **stale already-open
   EDGEFOLIO window** from before an earlier rebuild — Electron doesn't
   hot-reload, a window needs a full close+reopen to pick up a new install.
2. Client's real follow-up, and a legitimate product point: don't force HR to
   pre-create every employee by hand when the machine already sent the name —
   only ask for what's actually still missing. Landed on, after iterating live
   with the client on the exact shape: a "Create Employees & Map Remaining"
   button in Machine Import that opens an **inline editable grid** (name
   pre-filled from the machine, editable; department + salary — the only two
   fields the backend actually requires, `ensureRequired(['name','department',
   'salary'])`) for every still-unmapped row, then creates + maps all of them
   in one save via the existing `POST /employees` + mappings endpoints — no
   backend changes needed for this part, pure frontend reuse. Everything else
   (bank details, designation, etc.) stays for HR to fill in later from
   Employees, same import-then-enrich idea.
3. Added a delete button for staged batches (`DELETE
   /attendance/machine-import/batches/:batchId`, new `deleteBatch()` in
   `machineImportModel.js`, only touches staging rows, never
   `attendance_records`) — client pointed out people will naturally re-upload
   when a first attempt doesn't look right (exactly what happened above:
   6 duplicate batches), and there was no way to clean those up.
4. Renamed "ALOG (Realtime)" → "ALOG/AGL (Realtime)" throughout the modal
   (tab label, subtitle, dropzone hint, plugin registry entry) — the real
   file was `AGL_001.TXT`, not obviously "ALOG" to someone looking for their
   file format by name. Also corrected the "Expected ALOG columns" hint,
   which named a fixed column list that doesn't match how the parser actually
   works anymore (header-name matching, not fixed position — previous entry).

**Also found and fixed while committing self-enroll work:** `.gitignore` had
`ImportModal.jsx` on its own line under a stray, unrelated `#contact info`
comment — confirmed via `git log --all` / `git ls-files` that this file (the
entire attendance-import UI, ~780 lines at the time) had **never once been
committed**, for the whole time it's existed. Removed the bad rule, added the
file. Anyone who re-cloned this repo before today would have been missing
this file entirely.

**Deployed:** rebuilt and silently reinstalled multiple times this session as
each piece landed (self-enroll backend, bulk-create-employees grid, ALOG/AGL
labels) — confirmed clean restart each time via `/health`. Not yet
re-published to the marketing site (`edgefolio.iotsoft.in`) or version-bumped
past `1.0.1` — this round hasn't been asked to ship externally yet, unlike the
ALOG parser fix which was.

### 2026-09-02, later still — Face ID drawer tab; Attendance Register redesign; first attendance-based payroll rule

**Face ID tab added to `EmployeeDrawer.jsx`** (desktop, Employees page) — the
piece flagged as missing two entries back. Lazy-fetches `GET /api/v1/faces/:id/
status` only when the tab is opened. Read-only by design (no footer button —
falls through the existing `tab === 'basic' || 'bank'` / `'custom'` footer
conditions, matches nothing) — shows both the phone self-enroll status and the
office-machine 3-angle photo status side by side, since they're genuinely
separate subsystems sharing one table.

**Real client feedback (live testing) drove a large Attendance page
redesign**, in order:

1. **Machine Import**: department field is now a real `<select>` (was a
   free-text+datalist input) with a "+ Create New Department" option that
   creates it via the real `departments` table (`POST /departments`) inline,
   not just as a string on one employee — so it shows up in every other
   department dropdown afterward too.
2. Salary can't be negative — fixed at both layers: backend
   (`models/employee.js`'s new `assertValidSalary()`, used by both create and
   update, throws 400) is the real guard; `min="0"` added to all three salary
   inputs in the app (Add Employee, Edit Employee, bulk-create grid) is just
   the UX hint.
3. The Commit button now gets a visible green highlight + glow once every
   machine ID is mapped, so it's obvious where to go next instead of hunting
   for it.
4. **"Daily Attendance Register" → "Attendance Register" with Daily / Monthly
   / Date Range tabs**, plus an optional Employee filter that applies across
   all three. Client's own framing, verbatim: "if employee selected then show
   its attendance for specific day, month or date range" — so selecting an
   employee switches Monthly from the whole-company roll-up (present/absent/
   leave day counts per employee) to that one employee's own day-by-day list,
   which is what they actually meant by "confusing" — a monthly view that
   could only ever show everyone's totals, never one person's daily history.
5. **Real bug/gap found via a real question** ("17 present on Aug 18 but
   Absent tab shows nobody?"): `attendance_records` only ever gets a row for
   someone who punched — a machine-imported dataset never creates an explicit
   `status='absent'` row for someone who didn't show up, so the backend's
   `attendanceStatsByDate` absent count (`SUM(status='absent')`) is
   structurally always 0 for this data, and the register's "Absent" filter
   had nothing to show. Fixed **client-side, additively**: Daily view now
   diffs the full employee list against that day's records and synthesizes
   display-only "Absent" rows for anyone missing (`isDerived: true`, never
   written to the DB) — `dailyStats` recomputes present/absent/leave from
   this merged list instead of trusting the backend's always-0 absent count.
6. **Holidays now visibly marked** on the Daily register — fetches the
   existing (previously orphaned-from-Attendance) `holidays` table once on
   mount. If the selected date is a holiday, derived-absent rows get status
   `'holiday'` (blue badge) instead of red `'Absent'`, and a banner shows the
   holiday name. This existed as a fully-built feature (schema, API, Settings
   UI) with zero connection to Attendance before this.
7. **Mark Paid/Unpaid Leave** buttons on derived-absent rows — new
   `attendance_records.leave_type` column (`'paid'|'unpaid'`, only meaningful
   when `status='leave'`, cleared back to null on any non-leave write so it
   can't go stale). Reuses the existing `POST /attendance/event` endpoint
   (`upsertAttendanceEvent` already took a `status` override, just needed to
   also persist `leaveType`) — no new endpoint needed.
8. **"Detail Punch Record" modal** — every raw punch behind a first-in/
   last-out row is still sitting in `machine_import_staging` after commit
   (commit only marks rows `'committed'`, never deletes). Extended
   `GET /attendance/machine-import/records` with `employeeId`
   (→ `mapped_employee_id`) and `date` (→ `punch_date`) filters — the
   endpoint already existed for the Machine Import batch-review UI, this just
   gave it a second caller. New "Punches" button on Daily and Range rows
   opens it.

**First attendance-based payroll rule, actually wired into real payslip
generation** (`createPayrollRun`, not just the `previewPayrollFromSalary`
demo function) — client asked directly "how do big businesses do this,"
confirmed: per-day rate = Basic ÷ **actual days in that month** (not a flat
30), LOP (Loss of Pay) days reduce pay via one explicit "Loss of Pay (Xd)"
deduction line, computed at `perDayRate × lopDays`.

**Deliberately scoped to be safe, not maximal**: `getLopDaysCount()`
(`models/attendance.js`) counts *only* days HR explicitly marked
`status='absent'` or `status='leave'` + `leave_type='unpaid'` — it does
**not** treat "no punch that day" as automatic LOP. Reason, found by actually
checking the schema before writing the calculation: `working_hours` only
stores `days_per_week` as a **count** (e.g. `6`), never *which* weekday is
the off day. Auto-deducting every unpunched day would silently and
incorrectly dock pay for every weekly off (Sundays etc.) — a real, harmful
payroll bug, not a hypothetical one. Until weekly-off days are tracked
explicitly (not built), LOP only fires when HR consciously clicks "Unpaid
Leave" in the register — safe by construction, but not yet the fully
automatic "missing day = deducted" flow the client originally asked about.
**Flag this clearly to whoever picks up payroll work next**, and see if the
client wants weekly-off-day configuration built before relying on this for
real payroll runs.

**Verified:** migration checked against a scratch copy of the real DB
(`leave_type` column confirmed added cleanly) before deploying, same
established pattern as every other schema change this session. Rebuilt and
redeployed; confirmed clean restart via `/health`.

### 2026-09-02, later still — weekly-off-day config unlocks full automatic LOP; register/payroll button parity fixes

**Weekly-off-day configuration, closing the gap flagged in the previous
entry.** New `working_hours.weekly_off_days` column — JSON array of
day-of-week ints (`Date.getDay()` convention, 0=Sunday), distinct from the
pre-existing `days_per_week` (always just a count, never which day).
Settings → Working Hours gets a Sun–Sat toggle row. Default `[0,6]`
(Sat+Sun) if nobody's configured it, matching `days_per_week`'s existing
default of 5.

This makes `getLopDaysCount()` (`models/attendance.js`) safe to fully
automate — now that weekly-offs are known precisely, a day with **no
attendance record at all** can finally be treated as a genuine no-show
(previously impossible to tell apart from a normal off day, so LOP only
ever counted explicit HR-marked absences/unpaid-leave). Both weekly-offs and
holidays are excluded from LOP regardless of whether a record exists.

**One important safety guard added**: if an employee has **zero**
attendance records at all in the payroll month (e.g. a payroll run for a
month before EDGEFOLIO was adopted, or before that employee's first import),
`getLopDaysCount()` returns 0 rather than treating every working day as a
no-show — with no data, "unknown" must never become "assume the worst,"
since that would silently zero out someone's entire pay. Only kicks in once
there's at least one real record in the range, proving attendance was
actually being tracked that month.

The Attendance Register also now visually marks weekly-offs the same way as
holidays (grey "Weekly Off" badge instead of red "Absent", a note under the
date picker) — fetches `GET /settings/working-hours` once on mount.

**Register/payroll parity fixes, from real usage during this same
session:**
1. Monthly and Date Range views, once a specific employee is selected, now
   get the same day-by-day derivation Daily already had (missing days shown
   as Absent/Holiday/Weekly Off, not silently absent from the list) — a new
   shared `deriveDaySpan()` helper, plus the same Mark Paid/Unpaid Leave and
   Detail Punch Record actions Daily already had. Previously these only
   existed for Daily.
2. The All/Present/Absent/Leave filter row was missing whenever Monthly had
   an employee selected (the row's visibility was gated on
   `viewMode !== 'monthly'`, not accounting for the now-possible
   employee-specific flat-list case) — fixed.
3. Found and fixed a real bug while wiring the leave-marking refetch for
   Monthly: it was passing `monthValue` (e.g. `"2026-08"`) as a `toDate`
   argument expecting a full `YYYY-MM-DD` string, silently fetching the
   wrong span after marking a leave day in Monthly view.

**Real bug found and fixed in the manual "Record Attendance" Check In/Check
Out buttons**, from a direct client question ("why don't these follow
first-punch/last-punch like machine import?"). Answer: they're a completely
separate manual mechanism — each click just stamps the *server's current
clock time*, not derived from any punch data. That's fine and intentional
(a fallback for marking someone with no machine data). What wasn't
intentional: `upsertCheckOut()` silently called `upsertCheckIn()` first, so
clicking "Check Out" for someone with zero records that day fabricated a
same-instant check-in **and** check-out (0 hours, no warning). Fixed:
`upsertCheckOut()` now refuses with a clear 400 ("No check-in recorded for
this employee today — check in first") instead of fabricating one. Also
added a live status line to the Record Attendance card — once an employee
is picked, it now shows their actual check-in/check-out state for the
selected date right there, instead of the card being a blind pair of action
buttons with no visible current state.

**Deployed:** migration verified against a scratch copy of the real DB
(`working_hours.weekly_off_days` confirmed added with the `[0,6]` default)
before deploying, same pattern as every prior schema change. Rebuilt,
reinstalled, confirmed clean restart via `/health`.

### 2026-09-03 — desktop admin account recovery (client literally locked themselves out)

Client forgot their own EDGEFOLIO desktop login while testing. Traced the
actual code: `forgot-password` only ever handled **employees** (APK users);
approving any reset requires an already-authenticated admin — a genuine,
total lockout with **no code path back in** if the sole admin forgets their
password. Same risk applies to any real client, not just this dev machine.
Unblocked the client immediately by hand (direct DB password reset, same
scrypt hash format `loginHandler` expects, verified before writing), then
built the real fix:

1. **Recovery code, self-service, fully offline.** New
   `users.recovery_code_hash` column. `setupHandler` now generates a
   `XXXX-XXXX-XXXX-XXXX` code at first-run setup, returns it **exactly
   once** in the setup response, and the frontend (`LoginPage.jsx`) forces
   it onto its own screen — copy button, explicit "I've saved this"
   checkbox — before letting the admin into the app at all, holding the
   login token pending until they confirm. New public endpoint
   `POST /auth/reset-with-recovery-code` (`email` + `recoveryCode` +
   `newPassword`) verifies against the hash and resets the password — no
   admin session, no internet, no employee record required. New "Forgot
   password?" link on the sign-in screen opens this flow. Same
   generic-error pattern as normal login (doesn't reveal whether the email
   exists or the code was wrong).
2. **Fallback for when the recovery code is *also* lost** — a support-side
   tool, not self-service. `EDGE/scripts/reset-admin-password.js` (bundled
   inside `app.asar` via `files`, so `require('better-sqlite3')` resolves
   through the same `asarUnpack`'d native module every other backend code
   uses — proven pattern, same as running `backend/index.js` directly
   earlier this session) + `RESET-ADMIN-PASSWORD.bat` (bundled via
   `extraResources` as a **loose file outside the asar**, specifically so
   it's a real double-clickable file at
   `C:\Program Files\EDGEFOLIO\resources\RESET-ADMIN-PASSWORD.bat` — asar
   contents aren't directly runnable from Explorer). Prompts for the
   admin's email, sets `ELECTRON_RUN_AS_NODE=1`, runs the script through the
   client's own installed `EDGEFOLIO.exe` (guarantees native-module ABI
   match — a separately-distributed Node build would almost certainly
   mismatch), prints a random new password to share with the client over
   the phone/WhatsApp during a support session.

**Verified for real, not just "should work":** ran the actual bundled
`.bat`'s underlying command against the real installed app
(`resources\app.asar\scripts\reset-admin-password.js`) — it found the real
`users` table, reset the password, and a follow-up `POST /auth/login` with
the new password returned a real `200` with a valid JWT. Also re-verified
the `recovery_code_hash` migration against a scratch copy of the real DB
before deploying.

**Not yet done:** rate-limiting on `POST /auth/reset-with-recovery-code`
(the code is a 64-bit random secret, cryptographically fine, but there's no
brute-force throttle — low priority for a local/offline app, worth
revisiting if this ever gets exposed beyond localhost).

### 2026-09-03, later — real Run Payroll bug: always ran the wrong month

Client asked directly how to actually run payroll for August, now that its
attendance data is corrected — surfaced a genuine bug. `handleRunPayroll` in
`PayrollPage.jsx` always used `new Date().toISOString().slice(0,7)` — **the
current calendar month**, no way to pick another one. Run on any day in
September, "Run Payroll" would process September (3 days in, no meaningful
attendance yet), never August, which is what the normal real-world workflow
actually needs (payroll for the month that just ended, run at the start of
the next month — confirmed this is standard practice earlier in this same
session when the client asked how professional payroll systems handle it).

Fixed: "Run Payroll" now opens a month picker, defaulting to **last month**
(the just-completed one) instead of the current one. Explicit warning if the
current, still-in-progress month is selected (LOP would be wrong — the
month isn't over). Also warns if the chosen month was already run, since
`createPayrollRun` is write-once per `monthKey` — running it again returns
the existing run as-is, it does **not** reprocess or pick up attendance
corrections made since. No backend change needed — `runMonthlyPayroll`
already accepted any `monthKey`, the frontend just never gave the user a
way to choose one.

**Known limitation, flagged not fixed:** no way to force a recompute of an
already-run month if attendance gets corrected afterward. Not an issue for
this client's August run (never successfully run before today, since there
was no way to target August at all) but worth building if corrections after
a run turn out to be a real recurring need — would need a delete-and-rerun
or explicit "reprocess" action, since the current one-shot design doesn't
support it.

**Deployed:** rebuilt, reinstalled, confirmed clean restart via `/health`.

### 2026-09-03, later — payroll: bonus/reimbursement/overtime + real preview-before-finalize

Client asked for a "professional" payroll experience — preview before
anything is committed, plus the adjustments every company needs monthly
(bonus, reimbursement, overtime), with employee loans and late/early rules
planned as a deliberately separate next phase (both touch either real
money owed back to the company or labor-law-sensitive pay docking — used
`/plan` for this one given the scope, approved plan at
`C:\Users\User\.claude\plans\optimized-floating-gizmo.md`).

Two scoping findings from investigating before planning, both still true
and worth remembering:
- **No HR-side approval UI exists** for the APK's unified
  `employee_requests` (which already has `expense`/`advance_salary`
  types) — no desktop screen, no approve endpoint. So reimbursements/loans
  can't be sourced from approved APK requests yet, only entered directly
  by HR. Real, valuable follow-up once that approval UI gets built.
- **No employee-to-shift assignment exists** — `shifts` is pure CRUD,
  never linked to `employees`. Overtime (built this entry) uses the
  single global `working_hours.hours_per_day`, not a per-shift threshold.

**What shipped:**
- New `payroll_adjustments` table (`kind` ∈ bonus/reimbursement/
  other_earning/loan_emi/other_deduction — the last two exist now for
  Phase 3 later, unused so far). `working_hours` gets
  `overtime_rate_multiplier` (default 1.5).
- `models/payroll.js` refactored: the per-employee calculation that used
  to live inline in `createPayrollRun`'s loop is now a standalone
  `computeEmployeePayroll(employee, monthKey, earningsConfig,
  deductionsConfig)` — folds in LOP (existing), a new **Overtime** earnings
  line (`getOvertimeHours()` in `models/attendance.js`, mirrors
  `getLopDaysCount`'s exact pattern — sums hours beyond `hours_per_day` on
  `status='present'` days only), and any `payroll_adjustments` for that
  employee+month, each keeping its own label as a distinct payslip line
  (never lumped together). `createPayrollRun` is now a thin
  compute-then-persist wrapper around the same function.
- New **real** preview: `GET /payroll/preview-run?month=YYYY-MM` — pure
  read/compute, safe to call repeatedly, no `payroll_runs`/`payslips`
  write. Deliberately a different path from the pre-existing
  `POST /payroll/preview`, which turned out to be something unrelated (a
  generic single-number DA/HRA/PF/ESI calculator with zero employee or
  attendance awareness) — found this by actually reading
  `payrollController.js` before assuming a name was free.
  `POST/GET /payroll/adjustments`, `DELETE /payroll/adjustments/:id` for
  bonus/reimbursement entry.
- `PayrollPage.jsx`'s Run Payroll modal (month picker, added earlier
  today) now has a real second step: Preview — a table, one row per
  employee (Basic/LOP/Overtime/Gross/Deductions/Net), a "+ Add" per row
  for bonus/reimbursement/other with an inline label+amount form,
  removable adjustment chips, a running total, "← Back" or "Finalize
  Payroll". The existing payslip view/print/email templates needed **zero
  changes** — they already render `earnings`/`deductions` generically via
  `Object.entries()`, confirmed before building any of this so the new
  line items would "just work."

**Verified for real, not just "should work":** hit `GET /payroll/preview-run
?month=2026-08` against the real, live company data (21 employees) via a
real JWT — hand-verified the numbers for one employee against the actual
formulas: LOP `(10000/31)×14 = 4516.13` ✓ exact match; overtime
`((10000/31)/8)×5.28×1.5 = 319.35` ✓ exact match. Created a real test
bonus via `POST /payroll/adjustments`, confirmed it appeared as its own
payslip line in the next preview call, deleted it via `DELETE
/payroll/adjustments/:id`, confirmed a follow-up preview call shows it
gone — no leftover test data in the client's real system. Schema verified
against a scratch copy of the real DB before deploying, same as every
other migration this session.

**Deliberately not run for real:** did not click Finalize on the client's
actual August payroll during this verification — that writes a permanent
`payroll_runs`/`payslips` record for their real company, which is the
client's call to make, not something to trigger while testing.

**Not started (Phase 3/4 from the plan, paused for a check-in as
planned):** Employee Loans/Advances (EMI auto-deduction against a loan
balance) and Late Coming/Early Leaving rules (report-only by default —
flagged in the plan as having real Payment-of-Wages-Act implications in
India if auto-deducted without an explicit HR-confirmed rule). Full design
for both already exists in the approved plan file; not implemented yet.
