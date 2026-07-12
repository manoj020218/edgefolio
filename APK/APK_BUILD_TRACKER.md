# EDGEFOLIO APK — Build Tracker
**Living document — tick checkboxes as each task is completed**
**Last Updated:** 2026-05-28
**Current APK Version:** v0.0.0 (not yet built)

---

## Quick Status

| Phase | Description | Status |
|---|---|---|
| A | EDGE Backend Additions (new files only) | 🟡 Partial — infra + desktop UI remain |
| B | APK Foundation + Auth | ✅ Complete |
| C | Core Attendance — Employee | ✅ Complete (C1–C8; C9 moved to Phase D) |
| D | HR-Admin Dashboard | ✅ Complete |
| E | Owner Dashboard | ✅ Complete |
| F | Testing & Release | 🟡 Partial — unit tests written; release build manual |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        EDGEFOLIO APK                            │
│          Employee / HR-Admin / Owner  (same APK, 3 roles)       │
└───────────────────┬─────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │ On LAN                │ Remote / Tour / WFH
        │ 192.168.x.x:7001      │ companyid.edgefolio.iotsoft.in
        │ (direct, fast)        │ (FRP tunnel via VPS)
        └───────────┬───────────┘
                    │
           ┌────────▼────────┐
           │   EDGE PC :7001  │  ← Single source of truth
           │  Node.js+SQLite  │    Face photos + embeddings here
           │  Multi-vendor    │    Machine data (Jenix/ALOG/U5)
           └─────────────────┘
                    │ relay only
           ┌────────▼────────┐
           │  VPS 154.61.69  │  frps relay + marketing page only
           │  ZERO data here │  No employee data ever on VPS
           └─────────────────┘
```

**Face recognition:** 100% on-device (TFLite MobileFaceNet, INT8, 4MB)
**Reference embeddings:** Downloaded from EDGE → APK (AES-256 encrypted at rest)
**Live embeddings:** Generated + compared on APK — never transmitted

---

## Attendance Type Logic (CRITICAL — read before coding anything)

```
Every employee has a daily work assignment set by HR:
  office (default) │ tour │ wfh

┌─────────────────────────────────────────────────────────────────┐
│ work_type = office (default for everyone)                       │
│   → Mobile attendance: BLOCKED                                  │
│   → Must use office biometric machine                           │
│   → App shows: "You are scheduled in-office today.             │
│                 Please use the office attendance system."       │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ work_type = tour  (HR marks with date range)                    │
│   → Mobile attendance: ALLOWED via app                          │
│   → GPS mandatory — location recorded                           │
│   → Attendance record type: 'mobile-tour'                       │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ work_type = wfh   (HR marks with date range)                    │
│   → Mobile attendance: ALLOWED via app                          │
│   → GPS mandatory — location recorded                           │
│   → Attendance record type: 'mobile-wfh'                        │
└─────────────────────────────────────────────────────────────────┘

IMPORTANT — What allow_remote_attendance means (existing column):
  This column is NOT about mobile app.
  It means "this employee can clock-in via machine at a DIFFERENT branch office."
  APK completely ignores this column.
  APK reads only the new daily work_assignment table.
```

**HR sets tour/WFH from EDGE desktop or Admin APK:**
- Assigns a date range: `from_date` to `to_date`
- Example: "Raju on tour from 2026-05-27 to 2026-06-03"
- APK checks: does today fall inside any active assignment for this employee?
- No active assignment → default is `office` → mobile blocked

---

## Roles

| Role | `app_role` value | APK Screen |
|---|---|---|
| Owner | `owner` | Owner Dashboard — live headcount, analytics, read-only |
| HR Admin | `hr-admin` | Admin Dashboard — manage employees, tour/WFH, broadcasts, alerts |
| Employee | `employee` | Attendance Screen — mark attendance, own history, announcements |

> `app_role` column already exists in `employees` table (currently defaults to `'user'`).
> Migration needed: rename `'user'` → `'employee'`.

---

## Code Rule — DO NOT Touch Existing Files

```
┌─────────────────────────────────────────────────────────────────┐
│  RULE: All APK-related additions to EDGE backend go in          │
│        NEW files only.                                          │
│                                                                 │
│  DO NOT modify:                                                 │
│    routes/auth.js          routes/employees.js                  │
│    routes/attendance.js    routes/announcements.js              │
│    routes/faces.js         controllers/*.js (existing)          │
│    server.js (except registering the new route file)            │
│                                                                 │
│  NEW files to create:                                           │
│    routes/apk.js               ← all APK-specific endpoints    │
│    controllers/apkController.js ← all APK handler logic        │
│    migrations/apk-additions.sql ← schema additions only        │
│                                                                 │
│  If server.js needs one new line to register routes/apk.js,    │
│  that is the ONLY allowed change to existing files.            │
└─────────────────────────────────────────────────────────────────┘
```

See `APK_EDGE_INTERFACE.md` in this folder for the full data contract —
which existing tables each endpoint reads from, and what the request/response looks like.

---

## Phase A — EDGE Backend Additions (new files only)

### A1 — New Schema (file: `migrations/apk-additions.sql`)

- [x] `employees.allow_remote_attendance` — exists (NOT for mobile; for branch machine)
- [x] `employees.app_role` — exists (update default from `'user'` to `'employee'`)
- [x] `users.password_must_change` — exists
- [x] `users.temp_password_hash` — exists
- [x] `announcements` table — exists
- [x] `face_enrollments` table — exists
- [x] `password_reset_requests` table — exists
- [x] `employees.mobile_login_enabled INTEGER NOT NULL DEFAULT 1` — done (`database.js` APK migrations)
- [x] `employees.fcm_token TEXT` — done (`database.js` APK migrations)
- [x] New table: `work_assignments` — done (`database.js` APK migrations)
  ```sql
  CREATE TABLE IF NOT EXISTS work_assignments (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    work_type TEXT NOT NULL CHECK(work_type IN ('tour','wfh')),
    from_date TEXT NOT NULL,
    to_date TEXT NOT NULL,
    notes TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_wa_emp_date ON work_assignments(employee_id, from_date, to_date);
  ```
- [x] New table: `employee_alert_subscriptions` — done (`database.js` APK migrations)
- [x] New table: `apk_config` — done (`database.js` APK migrations, seeded with defaults)
- [x] `face_enrollments.embedding_json TEXT` — done (`database.js` APK migrations)

### A2 — New Route File (`routes/apk.js` + `controllers/apkController.js`)

All endpoints implemented in new files. Existing files untouched.

**Auth & Config:**
- [x] `GET  /api/v1/apk/config` — `getConfigHandler`
- [x] `GET  /api/v1/apk/login-check?empCode=` — `loginCheckHandler` (pre-login mobile_login_enabled check)
- [x] `POST /api/v1/apk/auth/login` — `apkLoginHandler` (empCode+password → JWT with role)
- [x] `PATCH /api/v1/apk/fcm-token` — `registerFcmTokenHandler`

**Work Assignment:**
- [x] `GET  /api/v1/apk/today-status` — `getTodayStatusHandler`
- [x] `GET  /api/v1/apk/work-assignments` — `getWorkAssignmentsHandler` (hr-admin/owner)
- [x] `POST /api/v1/apk/work-assignments` — `createWorkAssignmentHandler` (hr-admin)
- [x] `DELETE /api/v1/apk/work-assignments/:id` — `deleteWorkAssignmentHandler` (hr-admin)

**Attendance from Mobile:**
- [x] `POST /api/v1/apk/attendance` — `mobileAttendanceHandler` (validates work assignment + GPS)
- [x] `POST /api/v1/apk/attendance/batch-sync` — `batchSyncHandler`

**Live Feed:**
- [x] `GET  /api/v1/apk/live-feed` — `liveFeedHandler` (hr-admin/owner)

**Alert Subscriptions:**
- [x] `GET  /api/v1/apk/alert-subscriptions` — `getAlertSubscriptionsHandler`
- [x] `POST /api/v1/apk/alert-subscriptions` — `createAlertSubscriptionHandler`
- [x] `DELETE /api/v1/apk/alert-subscriptions/:id` — `deleteAlertSubscriptionHandler`

**Company / Offices:**
- [x] `GET  /api/v1/apk/offices` — `getOfficesHandler`

### A3 — FCM Integration (`services/fcmService.js` — new file)

- [x] Add `firebase-admin` to `EDGE/package.json` (v12.3.0; run `pnpm install` in EDGE/ to pull it)
- [x] `services/fcmService.js` — created; graceful no-op when `FIREBASE_SERVICE_ACCOUNT_PATH` not set
- [x] Hook in `apkController.js` — `notifyWatchers()` fires after every mobile check-in
- [ ] Admin broadcast FCM — `POST /api/v1/announcements` should also call `fcm.sendToTokens()` to all employee tokens; add in `apkController` broadcast handler (Phase D)
- [ ] Add `FIREBASE_SERVICE_ACCOUNT_PATH=` to EDGE `.env` file (JSON file stored outside git)

### A4 — server.js (ONE allowed change to existing file)

- [x] `routes/apk.js` registered: `app.use(`${API_PREFIX}/apk`, apkRoutes);`
- [x] `require('./routes/apk')` import added — that is the only change to existing files

### A5 — EDGE Desktop UI (new pages, do not edit existing pages)

- [ ] New page: **Tour / WFH Manager** — HR sets work assignments per employee with date range picker; reads/writes via `/apk/work-assignments`
- [ ] New page or panel: **Pending Password Resets** — badge on dashboard; reads `password_reset_requests` (existing table, new UI only)
- [ ] New notification area: incoming broadcasts from Admin APK shown on EDGE dashboard
- [ ] Employee edit page: add `mobile_login_enabled` toggle (this is an existing page — document in `APK_EDGE_INTERFACE.md` as change needed with minimal scope)

### A6 — Infrastructure

- [ ] EDGE PC: install `frpc`; configure `frpc.ini` (VPS IP + company subdomain + token)
- [ ] VPS: add `subdomain_host = edgefolio.iotsoft.in` to `frps.ini`; restart frps
- [ ] DNS: add wildcard A record `*.edgefolio.iotsoft.in → 154.61.69.200`
- [ ] Test: `curl https://yourcompanyid.edgefolio.iotsoft.in/health` returns `{ ok: true }`

---

## Phase B — APK Foundation + Auth

### B1 — Project Setup

- [x] Android project: `APK/android/` — Kotlin, minSdk 26, targetSdk 34, package `in.iotsoft.edgefolio`
- [x] `gradle/libs.versions.toml` — version catalog with all dependencies
- [x] `app/build.gradle.kts` — CameraX, ML Kit, TFLite, Room+SQLCipher, Retrofit, Hilt, Compose, WorkManager, FCM, Timber
- [x] `EdgefolioApp.kt` — `@HiltAndroidApp` + Hilt WorkManager init + Timber
- [x] `MainActivity.kt` — splash screen install + Compose host
- [x] `AndroidManifest.xml` — all permissions, FCM service, WorkManager provider
- [x] `google-services.json` in `.gitignore` (placeholder; user must add their Firebase file)

### B2 — Security Layer

- [x] `security/EncryptionManager.kt` — AES-256-GCM via Android Keystore; `encrypt/decrypt/deriveDatabaseKey()`
- [x] `data/prefs/EncryptedPrefs.kt` — `EncryptedSharedPreferences`; stores JWT, companyId, baseUrl, role, LAN IP cache

### B3 — Room Database (SQLCipher)

- [x] `data/db/AppDatabase.kt` — SQLCipher `SupportFactory`; key from `EncryptionManager.deriveDatabaseKey()`
- [x] Entity `CachedEmployee` — empId, embedding (AES blob), enrollmentStatus
- [x] Entity `PendingSyncRecord` — encrypted JSON payload, retryCount, syncedAt
- [x] Entity `LocalAttendanceRecord` — composite PK (empId, date), workType, synced flag
- [x] Entity `AnnouncementCache` — type, message, dismissed
- [x] `EmployeeDao`, `SyncDao`, `AttendanceDao`, `AnnouncementDao`
- [x] `di/AppModule.kt` — Hilt provides DB + all DAOs

### B4 — Network Layer

- [x] `network/CompanyIdResolver.kt` — 3s LAN probe → FRP fallback; caches LAN IP
- [x] `network/ApiClient.kt` — dynamic base URL Retrofit; Bearer token interceptor; rebuilds only when URL changes
- [x] `network/ApiService.kt` — Retrofit interface for all APK endpoints
- [x] `data/model/ApiModels.kt` — all request/response data classes

### B5 — Splash + Login

- [x] `ui/splash/SplashViewModel.kt` — checks JWT + version; routes by role
- [x] `ui/splash/SplashScreen.kt` — blue branded splash with spinner
- [x] `ui/login/LoginViewModel.kt` — login-check → offices → login → FCM register → role routing
- [x] `ui/login/LoginScreen.kt` — Company ID + Employee ID + Password + Remember Me + error cards
- [x] `ui/navigation/AppNavigation.kt` + `Screen.kt` — full nav graph with role-based routing

### B6 — Office Picker

- [x] `ui/login/OfficePickerScreen.kt` — radio list, CONTINUE button, uses shared `LoginViewModel`

### B7 — Forgot Password + Forced Change Password

- [x] `ui/login/ForgotPasswordScreen.kt` + `ForgotPasswordViewModel.kt`
- [x] `ui/login/ChangePasswordScreen.kt` + `ChangePasswordViewModel.kt` — back navigation blocked

### B8 — APK Version Check

- [x] `SplashViewModel` calls `GET /apk/config` → `compareVersions()` → force clears session if below min
- [ ] Force-update full-screen dialog composable (shown by SplashScreen when version too low) — **TODO Phase B next**
- [ ] Optional update banner on home screens — **TODO Phase C**

### B9 — FCM Service

- [x] `notifications/EdgefolioFcmService.kt` — receives FCM, shows notification, re-registers token on refresh

---

## Phase C — Core Attendance (Employee)

### C1 — Employee Home Screen ✅

- [x] `ui/employee/EmployeeHomeViewModel.kt` — loads today-status, local record, announcements, pending sync count
- [x] `ui/employee/EmployeeHomeScreen.kt` — office/tour/wfh badge, MARK ATTENDANCE button, synced/pending state, announcements, offline banner
- [x] EDGE offline detection: `GET /health` check; shows offline banner when unreachable

### C2 — CameraX + Face Preview ✅

- [x] `ui/attendance/CameraXManager.kt` — front camera, lifecycle-aware, ML Kit face detection per frame
- [x] Real-time face bounding box overlay (normalised `RectF` drawn over preview)
- [x] `requestCapture()` — delivers face-cropped Bitmap from next valid frame

### C3 — Liveness Detection ✅

- [x] `ui/attendance/LivenessDetector.kt` — 5s window, 2-blink OR 5° Euler-Y movement → PASSED
- [x] Exposes `blinkCount` so UI can show blink progress hints

### C4 — TFLite Face Embedding ✅

- [x] `ml/FaceEmbeddingEngine.kt` — MobileFaceNet INT8, 112×112 input, 128-dim L2-normalised output
- [x] `cosine()` + `matches()` (threshold 0.60) + `emaUpdate()` (β=0.15)
- [x] Model file: `app/src/main/assets/mobilefacenet.tflite` ← **must be added manually**

### C5 — Reference Embedding Management ✅

- [x] `workers/EmbeddingSyncWorker.kt` — downloads embedding from `GET /apk/faces/:empId/embedding`, encrypts + stores in Room
- [x] Enqueued on every successful login (employee role only) via `LoginViewModel`
- [x] EMA update in `AttendanceViewModel.maybeUpdateEma()` — once per calendar day on successful match

### C6 — Attendance Marking Flow ✅

- [x] `ui/attendance/AttendanceViewModel.kt` — full state machine:
      `Idle → Liveness → Capturing → Processing → AcquiringGps → Submitting → Done / Fail`
- [x] `ui/attendance/AttendanceCameraScreen.kt` — composable with camera preview, liveness hint, step overlay
- [x] GPS via `LocationManager.requestSingleUpdate()`, accuracy < 100m required
- [x] On EDGE offline: saves `LocalAttendanceRecord` + `PendingSyncRecord`, enqueues sync worker, reports Done

### C7 — Offline Sync Worker ✅

- [x] `workers/AttendanceSyncWorker.kt` — decrypts `PendingSyncRecord` → `POST /apk/attendance/batch-sync`
- [x] Exponential backoff 30 s base, max 5 attempts; purges synced records older than 30 days

### C8 — My Attendance History ✅

- [x] `ui/employee/MyHistoryViewModel.kt` — loads last 60 records from Room
- [x] `ui/employee/MyHistoryScreen.kt` — lazy list, date + checkin time + work type, SYNCED/LOCAL badge

### C9 — Face Enrollment Wizard (Phase D — HR-Admin only) ✅

- [x] 3-angle capture: front, left, right
- [x] Face detected per angle — retry if not detected
- [x] Generate embedding on-device (TFLite) → average 3 embeddings → L2-normalize → `POST /apk/faces/:empId/embedding`
- [x] Progress dots: 0/3 → 3/3 complete

---

## Phase D — HR-Admin Dashboard ✅

### D1 — Admin Home Screen ✅

- [x] Summary cards: Present Today / On Tour / WFH / Absent
- [x] Live feed list: `GET /apk/live-feed` → shows name + work type badge + check-in/out times
- [x] Pull-to-refresh via Refresh action in TopAppBar
- [x] Bottom nav: Dashboard · Tour/WFH · Employees · Broadcast (4 items)

### D2 — EDGE Offline Detection ✅

- [x] `EdgeHealthMonitor.kt` — pings `GET /health` every 30 seconds
- [x] 3 consecutive failures → `EdgeStatus.OFFLINE`
- [x] Sticky red banner on admin screens: *"Office System is Offline — Last seen HH:MM"*
- [x] On reconnect: banner auto-dismisses

### D3 — Tour / WFH Manager ✅

- [x] Employee list with current work assignment shown
- [x] Tap card → `AssignmentDialog` with date range picker (Material3 `DatePickerDialog`)
- [x] `POST /apk/work-assignments { employeeId, workType, fromDate, toDate, notes }`
- [x] Delete assignment via × button
- [x] Filter chips: All / TOUR / WFH / OFFICE

### D4 — Live Alert Subscriptions ✅

- [x] `AlertSettingsScreen`: employee list with check-in + check-out toggle per person
- [x] Strategy: delete existing → recreate with updated flags; both off = delete only
- [x] Uses `POST /apk/alert-subscriptions` + `DELETE /apk/alert-subscriptions/:id`

### D5 — Broadcast ✅

- [x] Type selector: SOS / Holiday / Event / General (4 `RadioButton` options)
- [x] Message field (6 lines max) + SEND TO ALL EMPLOYEES button
- [x] `POST /apk/broadcast` → EDGE creates announcement + FCM to all active employee tokens
- [x] Success card shows "Delivered to N device(s)" + Send Another button

### D6 — Employee Management ✅

- [x] List: name, dept, empCode, enrollment badge (Enrolled/Pending/None), mobile login toggle
- [x] Toggle `mobile_login_enabled`: `PATCH /apk/employees/:id { mobile_login_enabled: 0|1 }`
- [x] Spinner on switch while PATCH in flight; error snackbar on failure
- [x] "Enroll Face" button per employee → navigates to Face Enrollment Wizard

### D-C9 — Face Enrollment Wizard ✅

- [x] `FaceEnrollmentViewModel.kt` — 3-step state machine: FRONT/LEFT/RIGHT prompt → capture → upload
- [x] `FaceEnrollmentScreen.kt` — oval guide overlay, angle instruction label, progress dots
- [x] Averages 3 embeddings + L2-normalizes → `POST /apk/faces/:empId/embedding`
- [x] Retry flow if capture fails (face not detected)
- [x] DONE/FAIL result cards

### D7 — Backend additions for Phase D ✅

- [x] `apkController.js`: `broadcastHandler`, `getEmployeesHandler`, `patchEmployeeHandler`
- [x] `routes/apk.js`: `POST /broadcast`, `GET /employees`, `PATCH /employees/:id`
- [x] `ApiModels.kt`: `EmployeeDetail`, `AnnouncementRequest`
- [x] `ApiService.kt`: `broadcast()`, `getEmployees()`, `patchEmployee()`
- [x] `AppNavigation.kt`: all admin routes wired (`AdminHome`, `TourWfh`, `AlertSettings`, `Broadcast`, `EmployeeList`, `FaceEnrollment`)

---

## Phase E — Owner Dashboard (read-only analytics) ✅

### E1 — Owner Home ✅

- [x] Large headcount widget: "N of M present right now"
- [x] Breakdown: In-Office / On Tour / WFH / Absent (stat pills)
- [x] 7-day headcount trend — bar sparkline drawn with Canvas (no charting lib required)
- [x] Department breakdown with `LinearProgressIndicator` per dept

### E2 — Live Timeline ✅

- [x] Full employee list for today from `GET /apk/live-feed`
- [x] Filter chips: All / Present / Tour / WFH / Absent
- [x] Shows check-in, check-out (or "still present"), work type badge
- [x] ABSENT badge for employees with no record today

### E3 — Owner Broadcast ✅

- [x] Bottom nav "Broadcast" tab navigates to shared `BroadcastScreen` (same as HR-Admin)

### E4 — EDGE Offline ✅

- [x] `EdgeHealthMonitor` reused from admin package
- [x] Sticky red banner on all owner screens when EDGE is down

### E5 — Backend analytics endpoint ✅

- [x] `apkController.js`: `getAnalyticsHandler` — 7-day trend + dept breakdown (new function)
- [x] `routes/apk.js`: `GET /analytics` (hr-admin + owner)
- [x] `ApiModels.kt`: `AnalyticsResponse`, `DayCount`, `DeptStat`
- [x] `ApiService.kt`: `getAnalytics()`

---

## Phase F — Testing & Release

### F1 — Unit Tests 🟡

- [x] `EmbeddingMathTest.kt` — cosine similarity, L2-normalize, EMA update (10+ assertions)
  - `l2Normalize` — unit vector result, all-zeros no-crash, 128-dim magnitude = 1
  - `cosine` — identical=1, opposite=-1, orthogonal=0, above/below threshold
  - `emaUpdate` — result is unit vector, converges on fresh after many iterations, beta=0.15 bias
- [x] `LivenessDetectorTest.kt` — blink detection, head movement, reset (13 assertions)
  - Head ≥5° → PASSED, <5° → CHECKING, negative 5° → PASSED
  - 1 blink → CHECKING, 2 blinks → PASSED, one-eye-closed not counted
  - reset() clears blinkCount and head baseline
- [x] `VersionCheckTest.kt` — compareVersions logic (6 assertions)
  - equal, current-greater, current-lower, different-segment-lengths, force-update detection
- [x] Test infra: `junit4`, `mockk`, `coroutines-test` added to version catalog + build.gradle
- [ ] `EncryptionManager` round-trip — requires instrumented test (Android Keystore)
- [ ] `CompanyIdResolver` — needs OkHttpClient injection refactor for unit testing

### F2 — Integration Tests

- [ ] Employee with `office` work type → mark button not shown
- [ ] Employee with `tour` work type → full flow: liveness → face → GPS → EDGE record created with `attendance_mode = 'tour'`
- [ ] Offline: EDGE down → mark (tour) → EDGE up → sync → verified on EDGE
- [ ] Login blocked: HR sets `mobile_login_enabled = 0` → error shown on APK
- [ ] Role routing: each of 3 roles routes to correct screen

### F3 — Real-World Test

- [ ] 10 staff, 7 days: all attendance records match EDGE DB
- [ ] 2 employees on tour: GPS + face match flow works end to end
- [ ] Spoofing: printed photo, video playback (liveness must reject both)
- [ ] Admin live alert: check-in by employee → FCM arrives on admin device within 10s

### F4 — Release Build

- [ ] Generate `release.keystore` → store securely, NEVER commit to git
- [ ] `./gradlew assembleRelease`; verify APK is signed
- [ ] `VERSION_NAME = "1.0.0"`, `VERSION_CODE = 1`
- [ ] Upload to GitHub Releases: tag `apk-v1.0.0`, release notes
- [ ] Update `apk_config` on EDGE: `min_apk_version = '1.0.0'`
- [ ] Update VPS marketing page: Download APK button → GitHub Releases latest

---

## New EDGE Endpoints Summary (all in `routes/apk.js`, new file)

| Endpoint | Method | Reads from | Notes |
|---|---|---|---|
| `/apk/config` | GET | `apk_config` (new table) | No auth; APK checks on startup |
| `/apk/fcm-token` | PATCH | `employees.fcm_token` | Register device token |
| `/apk/today-status` | GET | `work_assignments` (new) | Employee's work type for today |
| `/apk/work-assignments` | GET | `work_assignments` | HR views all assignments |
| `/apk/work-assignments` | POST | `work_assignments` | HR sets tour/WFH |
| `/apk/work-assignments/:id` | DELETE | `work_assignments` | HR removes assignment |
| `/apk/attendance` | POST | `attendance_records` (existing) | Mobile attendance (tour/wfh only) |
| `/apk/attendance/batch-sync` | POST | `attendance_records` (existing) | Offline sync |
| `/apk/live-feed` | GET | `attendance_records` + `employees` | Admin live dashboard |
| `/apk/alert-subscriptions` | GET/POST/DELETE | `employee_alert_subscriptions` (new) | FCM alert management |
| `/apk/offices` | GET | `app_preferences` (existing) | Multi-location office list |
| `/apk/faces/:id/embedding` | GET | `face_enrollments` (existing) | APK downloads reference embedding |

**Existing endpoints APK also uses (no change needed):**
- `POST /api/v1/auth/login` — login (add `mobile_login_enabled` check via new middleware in `routes/apk.js`)
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/change-password`
- `GET  /api/v1/announcements`
- `POST /api/v1/announcements` (broadcast)
- `POST /api/v1/faces/:id/enroll`
- `GET  /api/v1/faces/:id/status`
- `DELETE /api/v1/faces/:id`
- `GET  /api/v1/attendance/member/:id` (history)

---

## APK Version History

| Version | Date | Phases included |
|---|---|---|
| v1.0.0 | TBD | B + C: login, roles, face attendance (tour/wfh), offline sync |
| v1.1.0 | TBD | D: HR-Admin dashboard, tour manager, live alerts, broadcast |
| v1.2.0 | TBD | E: Owner dashboard, analytics |

**In-app update check flow:**
1. App start → `GET /apk/config` → read `min_apk_version`
2. `BuildConfig.VERSION_NAME < min_apk_version` → force-update screen (not dismissible)
3. Newer optional version on GitHub Releases → dismissible banner

---

## Key Design Decisions

| Decision | Reason |
|---|---|
| `allow_remote_attendance` = branch machine remote, ignored by APK | Existing column serves a different purpose; APK has its own gate |
| Mobile attendance gated by HR daily tour/WFH assignment | Prevents employees marking from home when they should be in office |
| Default for all employees = office (mobile blocked) | Opt-in model — safer; HR explicitly unlocks each person |
| GPS mandatory for tour + WFH | Proof of location for remote attendance; accuracy < 100m enforced |
| attendance_mode = 'mobile-tour' / 'mobile-wfh' on EDGE record | HR/owner can filter and audit mobile vs machine attendance |
| All APK EDGE additions in new files only | Existing EDGE developers unaffected; APK work is isolated |
| FCM sent from EDGE backend (Firebase Admin SDK) | EDGE has internet (frpc tunnel runs on it); EDGE knows when attendance is marked |
| Login blocked per employee (`mobile_login_enabled`) | HR can suspend specific employee's app access instantly |
| Owner = read-only analytics | Owner cannot accidentally change data; clean role separation |
| EDGE offline detection via 30s health ping | Admin always knows if office system went down |

---

**Next step: Phase A — create `migrations/apk-additions.sql` and `routes/apk.js` + `controllers/apkController.js`**
