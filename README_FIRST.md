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
