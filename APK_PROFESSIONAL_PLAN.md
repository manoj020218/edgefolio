# EDGEFOLIO APK — Final Execution Plan
**Version:** 3.0 (Final)
**Date:** April 28, 2026
**Status:** APPROVED FOR EXECUTION

---

## Executive Summary

EDGEFOLIO APK is an Android attendance app for Indian SMEs.
It connects to a company's EDGE server (on-premise Windows/Linux machine) via a unique **Company ID**
instead of a raw IP address. Face recognition runs 100% on-device. Staff can mark attendance
from inside the office (LAN) or away (remote via FRP tunnel). Data privacy is guaranteed —
face embeddings never leave the device.

**Core design decisions locked in this plan:**
- Company ID = FRP subdomain (no IP addresses ever shown to users)
- Multi-office companies: company fixed → office location chosen separately
- Away-from-office is per-employee permission flag set on EDGE
- Attendance marked offline if EDGE is unreachable (sync on reconnect)
- Face photos enrolled via EDGE desktop or Admin APK — EDGE is the single source of truth
- Announcements go via FCM + SMS from admin's own phone (zero cost)
- Distribution via GitHub Releases + VPS webpage (no Play Store initially)

---

## 1. Infrastructure — FRP & Company ID

### How Company ID Works

Every EDGE installation gets a unique Company ID on first setup (e.g. `jenix-mumbai`).
EDGE runs `frpc` which connects to the VPS FRP server and registers that subdomain.

```
User types Company ID: jenix-mumbai
         ↓
APK checks network:
  ├─ On same LAN as EDGE?  →  connect to 192.168.x.x:7001  (fast, direct)
  └─ Remote / away?        →  connect to jenix-mumbai.edgefolio.iotsoft.in  (FRP tunnel)
```

VPS routes: `jenix-mumbai.edgefolio.iotsoft.in → EDGE machine port 7001`

### FRP Configuration

**On EDGE machine (`frp-client-config.ini`):**
```ini
[common]
server_addr = 154.61.69.200
server_port = 7000
token = <shared-frps-token>

[edgefolio-api]
type = http
local_ip = 127.0.0.1
local_port = 7001
subdomain = jenix-mumbai
```

**On VPS (`frps.ini`) — add one line:**
```ini
subdomain_host = edgefolio.iotsoft.in
```

**DNS (one record):**
```
*.edgefolio.iotsoft.in  →  154.61.69.200  (wildcard A record)
```

The edgeye `frps` already running on VPS is reused — no new infra needed.

### Multi-Office Companies

Same company can run multiple EDGE servers (one per office):
- `jenix-mumbai` → Mumbai office EDGE
- `jenix-delhi` → Delhi office EDGE
- `jenix-pune` → Pune office EDGE

On APK login, user enters Company ID `jenix` → APK fetches office list from VPS
registry → user selects their office → Company ID is locked for that session.
User can change office from the home screen (Change Office button, not Change Server).

---

## 2. Authentication Flow

### Login Screen

```
┌──────────────────────────────────────┐
│   EDGEFOLIO                          │
│                                      │
│   Company ID                         │
│   [jenix-mumbai______________]       │
│                                      │
│   Employee ID                        │
│   [EMP003_____________________]      │
│                                      │
│   Password                           │
│   [••••••••___________________]      │
│                                      │
│   [ ] Remember Me                    │
│                                      │
│   [         LOGIN          ]         │
│                                      │
│   Forgot Password?                   │
│                                      │
└──────────────────────────────────────┘
```

- Company ID resolves to EDGE address (LAN or FRP) transparently
- Employee ID + Password verified against EDGE backend (`/api/v1/auth/login`)
- JWT stored in `EncryptedSharedPreferences`
- On successful login: role checked → routed to Admin Dashboard or Staff Screen

### Office Picker (Multi-location companies)

Shown after Company ID is entered if the company has multiple EDGE servers registered:

```
┌──────────────────────────────────────┐
│   Select Your Office — Jenix Corp    │
│                                      │
│   ○  Mumbai HQ  (jenix-mumbai)       │
│   ○  Delhi Branch  (jenix-delhi)     │
│   ○  Pune Factory  (jenix-pune)      │
│                                      │
│   [       CONTINUE       ]           │
└──────────────────────────────────────┘
```

Selection is saved. Can be changed from home screen → "Change Office".

### Forgot Password Flow

```
Staff taps "Forgot Password?"
         ↓
APK sends request to EDGE:
POST /api/v1/auth/forgot-password
{ empId: "EMP003", companyId: "jenix-mumbai" }
         ↓
EDGE saves pending request, shows notification to Admin on EDGE desktop:
"Password reset requested by Amit Patel (EMP003)"
         ↓
Admin clicks → sets a one-time temporary password
         ↓
EDGE sends SMS to employee's registered phone number (via EDGE server SMS)
"Your temporary EDGEFOLIO password: TMP#8472. Login and change immediately."
         ↓
Employee logs in with temp password
         ↓
APK detects password_must_change = true flag in JWT response
         ↓
Force-shows Change Password screen BEFORE routing to home
Employee cannot skip or go back
         ↓
New password saved → normal login flow continues
```

**EDGE backend additions needed:**
- `password_must_change` column in `users` table
- `POST /api/v1/auth/forgot-password` endpoint
- `POST /api/v1/auth/change-password` endpoint
- Admin notification on EDGE desktop for pending reset requests

---

## 3. Away-from-Office Mode

### Per-Employee Flag on EDGE

In EDGE desktop → Employees → Edit Employee → toggle:
```
[ ] Allow Remote Attendance
    If enabled, this employee can mark attendance
    from outside the office. Location is always
    recorded and attached to the attendance record.
```

Stored as `allow_remote_attendance BOOLEAN DEFAULT 0` in `employees` table.

### APK Behaviour

| Condition | In-Office | Remote (allowed) | Remote (not allowed) |
|---|---|---|---|
| Face match | ✅ required | ✅ required | — |
| Liveness | ✅ required | ✅ required | — |
| Location | recorded | recorded (mandatory) | ❌ blocked |
| Geofence check | ✅ must be within range | skipped | — |
| EDGE connection | LAN preferred | FRP tunnel | — |
| Attendance saved | EDGE + local | local → sync | rejected |

When remote attendance is marked, the attendance record stores:
```json
{
  "location": { "lat": 19.0760, "lon": 72.8777, "accuracy": 12 },
  "attendanceMode": "remote",
  "networkType": "4G"
}
```

Admin can filter "remote" attendance separately in reports.

---

## 4. Offline Attendance (EDGE Unreachable)

If EDGE is offline but face match + liveness + location all pass:

```
1. Attendance record saved to APK local Room DB (PendingSyncRecord)
2. Success screen shown to user — "Marked (Pending Sync)"
3. Background worker monitors EDGE connectivity
4. When EDGE comes online → batch POST to /api/v1/attendance/batch-sync
5. EDGE validates + inserts records with original timestamps
6. Local pending records cleared
```

Offline buffer: up to 500 records stored locally.
Records older than 7 days without sync trigger an admin alert.

**Sync payload:**
```json
POST /api/v1/attendance/batch-sync
{
  "records": [
    {
      "empId": "EMP003",
      "timestamp": "2026-04-28T09:35:42Z",
      "similarity": 0.94,
      "confidence": 92,
      "liveness": "PASSED",
      "location": { "lat": 19.076, "lon": 72.877, "accuracy": 15 },
      "attendanceMode": "office",
      "deviceId": "SM-A52-xxxx"
    }
  ]
}
```

**EDGE backend addition needed:** `POST /api/v1/attendance/batch-sync` endpoint.

---

## 5. Face Enrollment

### Two Paths — EDGE is Always Master

**Path A: Enrolled from EDGE Desktop**
- Admin uploads 3 photos via EDGE web UI (existing file upload)
- Photos stored in `EDGE/storage/faces/{empId}/`
- Embeddings generated by Python face service on EDGE
- APK downloads embeddings on next sync (never downloads raw photos)

**Path B: Enrolled from Admin APK**
```
Admin opens Enrollment Screen on APK
         ↓
Capture 3 photos (front, right 45°, left 45°) using CameraX
         ↓
Each photo: validate quality (brightness, face detected, resolution)
         ↓
POST /api/v1/employees/{empId}/face-enroll  (multipart, one photo at a time)
         ↓
EDGE receives photo → validates → saves to EDGE storage → generates embedding
         ↓
EDGE responds: { ok: true, angle: "front", quality: 96 }
         ↓
APK deletes the captured photo from device storage IMMEDIATELY after 200 OK
         ↓
Repeat for all 3 angles
         ↓
All 3 confirmed → enrollment complete → APK has zero face data stored
```

No face photos ever persist on Admin APK. EDGE is the only storage.

**EDGE backend addition needed:**
- `POST /api/v1/employees/:id/face-enroll` (multipart photo upload)
- `GET /api/v1/employees/:id/face-status` (enrollment progress)
- `DELETE /api/v1/employees/:id/face` (re-enrollment reset)

---

## 6. Announcement System

### Announcement Sources
- **From EDGE desktop**: Admin creates announcement in EDGE web UI
- **From Admin APK**: Admin creates announcement from Admin Dashboard → Announcements tab

Both use the same EDGE backend endpoint:
`POST /api/v1/announcements`

### Announcement Types

| Type | Icon | Priority | SMS? |
|---|---|---|---|
| SOS / Emergency | 🔴 | Critical | Yes — immediate |
| Holiday | 🟡 | Normal | Yes |
| Unplanned Event | 🟠 | Normal | Yes |
| General Notice | 🔵 | Low | Optional |

### Delivery — Dual Channel

**Channel 1: FCM Push Notification** (internet-dependent)
- APK receives FCM message → shows in notification tray
- If app is open → in-app banner appears immediately

**Channel 2: SMS via Admin's Phone** (always works)
- Admin APK has `SEND_SMS` permission (no READ, no RECEIVE)
- On announcement submit, APK queues SMS to all staff phone numbers
- Uses Android `SmsManager.sendTextMessage()`
- Admin's SIM sends the SMS — free, no gateway needed
- For 50+ staff: show prompt "You have 50+ recipients. Consider an SMS plan for reliable bulk delivery. [Remind me later] [Proceed anyway]"

### Announcement Card on APK (Staff View)

```
┌──────────────────────────────────────────┐
│ 🔴  PUBLIC HOLIDAY — Tomorrow             │
│                                          │
│  Office closed on April 29 (Tuesday)     │
│  due to Maharashtra Day. Resume work     │
│  on April 30.                            │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │  📌  Rajesh Kumar  ·  HR Manager    │ │
│  │  Today at 10:42 AM                  │ │
│  └─────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

Chip shows: announcer name + designation (fetched from EDGE employee record).
Announcements stack on home screen and clear when user taps dismiss.

### EDGE Backend Additions Needed
- `announcements` table: `id, type, message, announced_by_emp_id, target (all/admin/staff), created_at`
- `POST /api/v1/announcements`
- `GET /api/v1/announcements?since=<timestamp>`
- EDGE desktop UI: Announcement tab in existing Settings or new nav item

---

## 7. APK Screens Summary

### Screen Map
```
Splash
  └─ Login
       ├─ Office Picker (if multi-location)
       ├─ Forgot Password flow
       └─ Change Password (forced if temp password)
            ├─ Admin Dashboard
            │    ├─ Quick Stats
            │    ├─ Live Attendance Feed
            │    ├─ Announcements (create + history)
            │    ├─ Manage Employees
            │    │    └─ Face Enrollment Wizard
            │    ├─ Reports
            │    └─ Settings
            │         ├─ Away-from-Office permissions
            │         ├─ Geofence radius
            │         └─ VPS (Phase 3)
            └─ Staff Attendance Screen
                 ├─ Mark Attendance (face flow)
                 ├─ My Attendance History
                 └─ Announcements (read only)
```

### Staff Attendance Screen — Key State Changes

```
Status States:
  NOT MARKED YET     →  [MARK ATTENDANCE] button active
  MARKED (SYNCED)    →  Green tick, time shown, no button
  MARKED (PENDING)   →  Orange clock, "Sync pending", no double-mark
  ALREADY MARKED     →  Info message, time of marking shown
```

---

## 8. Technology Stack (Final, Confirmed)

```
Category          Library                    License      Notes
─────────────────────────────────────────────────────────────────────
Language          Kotlin                     Apache 2.0
Min SDK           API 26 (Android 8.0)                   ~93% device coverage in India
Target SDK        API 34 (Android 14)

Camera            CameraX                    Apache 2.0   Lifecycle-aware
Face Detection    ML Kit Face Detection      Free*        On-device, no cloud call
                  *Google Play Services ToS — fine for commercial use in India

AI/ML             TensorFlow Lite (INT8)     Apache 2.0   MobileFaceNet model
                  MobileFaceNet.tflite       MIT/custom   4MB, 128-dim embeddings

Database          Room                       Apache 2.0   ORM
                  SQLCipher (community)      BSD/OpenSSL  DB-level encryption, free

Security          Android Keystore           Built-in     Hardware-backed key storage
                  EncryptedSharedPrefs       Apache 2.0   JWT + settings storage
                  AES-256-GCM               Built-in     Face data encryption

Networking        OkHttp                     Apache 2.0   HTTP client
                  Retrofit                   Apache 2.0   REST client
                  TLS 1.3                    Built-in     API 29+ automatic

Push              Firebase FCM               Free         1M msg/day free tier
SMS               Android SmsManager         Built-in     Admin's SIM, no gateway
Location          Google Play Location       Free         Fused location provider

UI                Jetpack Compose            Apache 2.0   Declarative UI
                  Material Design 3          Apache 2.0   Components
                  Navigation Compose         Apache 2.0   Screen routing

DI                Hilt                       Apache 2.0   Dependency injection
Async             Kotlin Coroutines + Flow   Apache 2.0
Logging           Timber                     Apache 2.0
JSON              Gson                       Apache 2.0
```

---

## 9. EDGE Backend Additions Required

These endpoints do not exist yet. Must be built before APK development starts:

| Endpoint | Method | Description |
|---|---|---|
| `/auth/forgot-password` | POST | Creates reset request, notifies admin |
| `/auth/change-password` | POST | Sets new password, clears must_change flag |
| `/employees/:id/face-enroll` | POST | Multipart photo upload from APK |
| `/employees/:id/face-status` | GET | Enrollment progress (0/3, 1/3, etc.) |
| `/employees/:id/face` | DELETE | Reset face enrollment |
| `/attendance/batch-sync` | POST | Bulk insert offline-buffered records |
| `/announcements` | GET/POST | Create + fetch announcements |
| `/employees/:id` | PATCH | Update `allow_remote_attendance` flag |
| `/company/offices` | GET | List of offices for multi-location picker |

**Schema additions:**
```sql
ALTER TABLE employees ADD COLUMN allow_remote_attendance INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN password_must_change INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN temp_password_hash TEXT;

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  announced_by TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT 'all',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS face_enrollments (
  emp_id TEXT PRIMARY KEY,
  angle_front TEXT,
  angle_right TEXT,
  angle_left TEXT,
  enrolled_at TEXT,
  enrolled_by TEXT,
  status TEXT DEFAULT 'pending'
);
```

---

## 10. Distribution

### APK
- Signed release APK uploaded to **GitHub Releases** (`manoj020218/edgefolio`)
- VPS webpage (`edgefolio.iotsoft.in`) has:
  ```
  [  Download Android APK  ]   →  github.com/manoj020218/edgefolio/releases/latest
  [  Download Windows .exe ]   →  github.com/manoj020218/edgefolio/releases/latest
  ```
- Staff installs APK via direct download link + "Install from unknown sources" (one-time)
- **No Play Store.** B2B enterprise tool — direct distribution is better (no review delays, no 30% cut)

### EDGE .exe
- `npm run build:exe` → electron-builder → uploads to GitHub Releases automatically (already configured)
- NSIS installer + portable `.exe` both published
- Auto-update polls GitHub Releases — no extra infra

---

## 11. Development Phases

### Phase A — EDGE Backend Additions (Week 1)
Before APK development begins, EDGE must have all new endpoints ready.
```
□ Schema migrations (allow_remote_attendance, password_must_change, announcements, face_enrollments)
□ forgot-password + change-password endpoints
□ face-enroll multipart upload endpoint
□ batch-sync attendance endpoint
□ announcements CRUD endpoints
□ office list endpoint
□ EDGE desktop: announcement create UI
□ EDGE desktop: password reset request notification
□ frpc config update (real VPS IP + subdomain)
□ VPS: subdomain_host added to frps.ini
□ DNS: wildcard *.edgefolio.iotsoft.in record added
```

### Phase B — APK Foundation (Weeks 2-3)
```
□ Android project setup (Kotlin, Gradle, Hilt)
□ Database schema (Room + SQLCipher)
□ Encryption key setup (Android Keystore)
□ Company ID resolver (LAN detection + FRP fallback)
□ Login flow + JWT storage
□ Office picker screen
□ Forgot password flow
□ Force change password screen
□ Role-based routing (Admin / Staff)
```

### Phase C — Core Features (Weeks 4-5)
```
□ CameraX integration + face preview
□ ML Kit face detection
□ TFLite MobileFaceNet embedding generation
□ Cosine similarity comparison
□ Liveness detection (blink + head movement)
□ Away-from-office location validation
□ Attendance marking flow (all states)
□ Offline buffer (Room DB pending sync queue)
□ Background sync worker (WorkManager)
□ Face enrollment wizard (Admin APK → upload → EDGE → delete local)
```

### Phase D — Advanced Features (Week 6)
```
□ Admin Dashboard (stats, live feed)
□ Announcement create + display (FCM + SMS dual channel)
□ SMS via SmsManager (SEND_SMS permission, 50+ staff prompt)
□ Multi-office switcher
□ My attendance history (Staff)
□ System status screen (EDGE online/offline indicator)
□ Settings (geofence radius, remote permission per employee)
```

### Phase E — Testing & Release (Week 7)
```
□ Unit tests: embedding comparison, EMA update, encryption
□ Integration tests: full attendance flow
□ Real-world test: 10 staff, 7 days
□ Spoofing test: printed photo, video playback
□ Offline test: EDGE down → mark → reconnect → sync verified
□ Away-from-office test: remote + in-office modes
□ Build signed release APK
□ Upload to GitHub Releases
□ Update VPS webpage with download links
```

---

## 12. Cost Summary

| Item | Cost | Notes |
|---|---|---|
| VPS | Already paying | Only recurring cost |
| GitHub Releases | Free | Hosting for APK + .exe |
| Firebase FCM | Free | 1M msg/day free tier, never exceeded |
| FRP (frps on VPS) | Free | Reuse existing edgeye setup |
| SMS delivery | Free | Admin's SIM via SmsManager |
| SMS for 50+ staff companies | Client pays separately | Prompt in-app at 50+ threshold |
| Android Studio + build tools | Free | |
| MobileFaceNet TFLite model | Free | Open source |
| Play Store | Not needed | Direct APK distribution |
| Code signing (APK) | Free | Debug key for now, release keystore self-generated |
| Windows EV cert for .exe | ₹0 | SmartScreen warns once on first install — acceptable for enterprise B2B |
| **Total additional cost** | **₹0** | **VPS is the only cost** |

---

## 13. What is NOT in APK (Deferred to Phase 3)

- Razorpay / VPS subscription payment
- MongoDB cloud archive
- Multi-location analytics dashboard
- iOS / iPhone version
- Biometric fingerprint login (Android biometric API — can add in v2.1)
- Advanced anti-spoofing (depth camera, IR — hardware-dependent)

---

**Status:** FINAL — APPROVED FOR EXECUTION
**Start with:** Phase A (EDGE backend additions) — all APK work blocked until these endpoints exist
**Last Updated:** April 28, 2026
