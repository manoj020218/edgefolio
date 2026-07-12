# APK ↔ EDGE Interface Contract
**Purpose:** This file is the single contract between the Android APK and the EDGE backend.
**Rule:** APK developers code against this spec. EDGE developers add new code matching this spec.
**Existing files are NOT modified** (except one line in server.js to register new route).

---

## EDGE Files Reference Map

```
EDGE/backend/
├── routes/
│   ├── apk.js            ← NEW FILE — all APK endpoints go here
│   ├── auth.js           ← EXISTING — APK uses /auth/login as-is
│   ├── attendance.js     ← EXISTING — APK uses /attendance/member/:id as-is
│   ├── announcements.js  ← EXISTING — APK uses GET/POST as-is
│   └── faces.js          ← EXISTING — APK uses enroll/status/delete as-is
├── controllers/
│   ├── apkController.js  ← NEW FILE — all APK handler logic
│   └── (all others)      ← EXISTING — DO NOT TOUCH
├── migrations/
│   ├── sqlite-schema.sql ← EXISTING — DO NOT TOUCH
│   └── apk-additions.sql ← NEW FILE — only additive schema changes
├── services/
│   └── fcmService.js     ← NEW FILE — Firebase Admin SDK wrapper
└── server.js             ← EXISTING — add ONE line only:
                             app.use(`${API_PREFIX}/apk`, apkRoutes);
```

---

## Auth / Login

### Existing endpoint (no code change needed)
**Route file:** `EDGE/backend/routes/auth.js`
**Controller:** `EDGE/backend/controllers/authController.js` → `loginHandler`
**DB tables read:** `users`, `employees`

```
POST /api/v1/auth/login

REQUEST:
{
  "empId": "EMP003",
  "password": "abc123",
  "companyId": "jenix-mumbai"   ← APK sends this for logging, not validated server-side
}

RESPONSE (success):
{
  "ok": true,
  "token": "<JWT>",
  "user": {
    "id": "emp-uuid",
    "empId": "EMP003",
    "name": "Raju Kumar",
    "role": "employee",          ← "owner" | "hr-admin" | "employee"
    "mobile_login_enabled": 1,   ← APK checks this; if 0 → show blocked error
    "password_must_change": 0
  }
}

RESPONSE (blocked — new check to add in apkController middleware):
HTTP 403
{
  "error": "LOGIN_BLOCKED",
  "message": "Mobile access is disabled. Contact your HR."
}
```

**Note for EDGE developer:** The `mobile_login_enabled` check cannot be added to `auth.js` (no-touch rule).
Instead, add a pre-login check endpoint that APK calls first:

```
GET /api/v1/apk/login-check?empId=EMP003
→ { "allowed": true }  or  { "allowed": false, "reason": "LOGIN_BLOCKED" }
```

APK calls this before submitting credentials. If not allowed, show error without hitting `/auth/login`.

---

## APK Config (no auth)

**Route file (new):** `EDGE/backend/routes/apk.js`
**Controller (new):** `EDGE/backend/controllers/apkController.js` → `getConfigHandler`
**DB tables read:** `apk_config` (new table)

```
GET /api/v1/apk/config

RESPONSE:
{
  "ok": true,
  "config": {
    "min_apk_version": "1.0.0",
    "geofence_radius_m": 200,
    "offline_buffer_days": 7
  }
}
```

---

## FCM Token Registration

**Route file (new):** `EDGE/backend/routes/apk.js`
**Controller (new):** `EDGE/backend/controllers/apkController.js` → `registerFcmTokenHandler`
**DB tables written:** `employees.fcm_token` (new column)

```
PATCH /api/v1/apk/fcm-token
Authorization: Bearer <JWT>

REQUEST:
{ "fcmToken": "fXm8k2..." }

RESPONSE:
{ "ok": true }
```

---

## Today's Work Status (employee checks before marking attendance)

**Route file (new):** `EDGE/backend/routes/apk.js`
**Controller (new):** `EDGE/backend/controllers/apkController.js` → `getTodayStatusHandler`
**DB tables read:** `work_assignments` (new table), `employees`

```
GET /api/v1/apk/today-status
Authorization: Bearer <JWT>

RESPONSE (employee is in-office — default):
{
  "ok": true,
  "workType": "office",
  "assignment": null
}

RESPONSE (employee is on tour):
{
  "ok": true,
  "workType": "tour",
  "assignment": {
    "id": "wa-uuid",
    "fromDate": "2026-05-27",
    "toDate": "2026-06-03",
    "notes": "Client visit - Pune"
  }
}

RESPONSE (employee is WFH):
{
  "ok": true,
  "workType": "wfh",
  "assignment": {
    "id": "wa-uuid",
    "fromDate": "2026-05-27",
    "toDate": "2026-05-27",
    "notes": ""
  }
}
```

**APK behaviour based on workType:**
- `"office"` → do NOT show attendance button → show info message
- `"tour"` or `"wfh"` → show MARK ATTENDANCE button + GPS is mandatory

---

## Work Assignment Management (HR-Admin)

**Route file (new):** `EDGE/backend/routes/apk.js`
**Controller (new):** `EDGE/backend/controllers/apkController.js`
**DB tables:** `work_assignments` (new table), `employees`

```
GET /api/v1/apk/work-assignments?date=2026-05-27
Authorization: Bearer <JWT> (hr-admin or owner role)

RESPONSE:
{
  "ok": true,
  "assignments": [
    {
      "id": "wa-uuid",
      "employee": { "id": "emp-uuid", "name": "Raju Kumar", "dept": "Sales" },
      "workType": "tour",
      "fromDate": "2026-05-27",
      "toDate": "2026-06-03",
      "notes": "Client visit - Pune",
      "createdBy": "HR Priya"
    }
  ]
}

POST /api/v1/apk/work-assignments
Authorization: Bearer <JWT> (hr-admin role)

REQUEST:
{
  "employeeId": "emp-uuid",
  "workType": "tour",       ← "tour" | "wfh"
  "fromDate": "2026-05-27",
  "toDate": "2026-06-03",
  "notes": "Client visit - Pune"
}

RESPONSE:
{ "ok": true, "id": "wa-uuid" }

DELETE /api/v1/apk/work-assignments/:id
Authorization: Bearer <JWT> (hr-admin role)

RESPONSE:
{ "ok": true }
```

---

## Mark Attendance from Mobile (tour / wfh only)

**Route file (new):** `EDGE/backend/routes/apk.js`
**Controller (new):** `EDGE/backend/controllers/apkController.js` → `mobileAttendanceHandler`
**DB tables written:** `attendance_records` (existing table — INSERT only, no schema change)
**DB tables read:** `work_assignments` (new), `employees` (existing)

```
POST /api/v1/apk/attendance
Authorization: Bearer <JWT>

REQUEST:
{
  "empId": "EMP003",
  "workType": "tour",                     ← must match today's active assignment
  "timestamp": "2026-05-27T09:35:42Z",
  "similarity": 0.87,
  "confidence": 93,
  "liveness": "PASSED",
  "location": {
    "lat": 18.5204,
    "lon": 73.8567,
    "accuracy": 12                        ← metres; reject if > 100
  },
  "deviceId": "SM-A52-xxxx"
}

RESPONSE (success):
{ "ok": true, "eventId": "evt-uuid", "alreadyMarked": false }

RESPONSE (already marked today):
{ "ok": false, "error": "ALREADY_MARKED", "checkedInAt": "09:35" }

RESPONSE (workType = office — mobile blocked):
HTTP 403
{ "error": "MOBILE_BLOCKED", "message": "Mobile attendance not enabled for today. Please use office machine." }

RESPONSE (location accuracy too low):
HTTP 422
{ "error": "LOCATION_ACCURACY", "message": "GPS accuracy is too low. Move to open area and retry." }
```

**What gets written to `attendance_records`:**
```
event_id        = generated UUID
member_id       = employee UUID (resolved from empId)
date            = today YYYY-MM-DD
check_in        = timestamp ISO
status          = 'present'
face_match      = similarity value
location_json   = '{"lat":..., "lon":..., "accuracy":...}'
attendance_mode = 'mobile-tour' OR 'mobile-wfh'
apk_source      = 1
device_id       = deviceId from request
```

---

## Offline Batch Sync

**Route file (new):** `EDGE/backend/routes/apk.js`
**Controller (new):** `apkController.js` → `batchSyncHandler`
**DB tables written:** `attendance_records` (existing)

```
POST /api/v1/apk/attendance/batch-sync
Authorization: Bearer <JWT>

REQUEST:
{
  "records": [
    {
      "empId": "EMP003",
      "workType": "tour",
      "timestamp": "2026-05-27T09:35:42Z",
      "similarity": 0.87,
      "confidence": 93,
      "liveness": "PASSED",
      "location": { "lat": 18.52, "lon": 73.85, "accuracy": 15 },
      "deviceId": "SM-A52-xxxx"
    }
  ]
}

RESPONSE:
{
  "ok": true,
  "synced": 3,
  "skipped": 1,       ← already existed
  "failed": 0
}
```

---

## Live Feed (Admin / Owner)

**Route file (new):** `EDGE/backend/routes/apk.js`
**Controller (new):** `apkController.js` → `liveFeedHandler`
**DB tables read:** `attendance_records` (existing), `employees` (existing)

```
GET /api/v1/apk/live-feed
Authorization: Bearer <JWT> (hr-admin or owner)

RESPONSE:
{
  "ok": true,
  "summary": {
    "totalEmployees": 32,
    "presentNow": 14,
    "onTour": 3,
    "wfh": 2,
    "absent": 13
  },
  "feed": [
    {
      "empId": "EMP003",
      "name": "Raju Kumar",
      "dept": "Sales",
      "workType": "tour",
      "checkinTime": "09:35",
      "checkoutTime": null,       ← null = still present
      "hoursWorked": 3.5,
      "status": "present"
    }
  ]
}
```

---

## Alert Subscriptions

**Route file (new):** `EDGE/backend/routes/apk.js`
**DB table:** `employee_alert_subscriptions` (new table)

```
GET /api/v1/apk/alert-subscriptions
Authorization: Bearer <JWT> (hr-admin)
→ Returns this admin's subscriptions

POST /api/v1/apk/alert-subscriptions
{ "watchedEmpId": "emp-uuid", "alertCheckin": true, "alertCheckout": true }
→ { "ok": true, "id": "sub-uuid" }

DELETE /api/v1/apk/alert-subscriptions/:id
→ { "ok": true }
```

**FCM payload sent to admin's device (from EDGE fcmService.js):**
```json
{
  "notification": {
    "title": "Raju Kumar checked in",
    "body": "09:12 AM • Tour • Sales Dept"
  },
  "data": {
    "type": "ATTENDANCE_ALERT",
    "empId": "EMP003",
    "workType": "tour",
    "time": "09:12"
  }
}
```

---

## Reference Embedding Download (APK caches locally)

**Route file (new):** `EDGE/backend/routes/apk.js`
**DB tables read:** `face_enrollments` (existing), `EDGE/storage/faces/{empId}/` (file storage)

```
GET /api/v1/apk/faces/:empId/embedding
Authorization: Bearer <JWT>

RESPONSE (enrolled):
{
  "ok": true,
  "embedding": [0.12, -0.45, 0.33, ...],  ← 128 floats
  "enrolledAt": "2026-04-28T10:00:00Z",
  "status": "complete"
}

RESPONSE (not enrolled):
{ "ok": false, "error": "NOT_ENROLLED", "status": "pending" }
```

**APK stores:** embedding encrypted with AES-256-GCM key from Android Keystore → Room DB

---

## Office List (multi-location)

**Route file (new):** `EDGE/backend/routes/apk.js`
**DB tables read:** `app_preferences` (existing)

```
GET /api/v1/apk/offices
No auth required

RESPONSE:
{
  "ok": true,
  "offices": [
    { "id": "jenix-mumbai", "label": "Mumbai HQ" },
    { "id": "jenix-delhi",  "label": "Delhi Branch" }
  ]
}
```

If only one EDGE server → array has one item → APK skips office picker.

---

## Existing Endpoints APK Uses (no change to EDGE code)

| Endpoint | File | Used by APK for |
|---|---|---|
| `POST /auth/login` | `routes/auth.js` | Employee login (with pre-check from `/apk/login-check`) |
| `POST /auth/forgot-password` | `routes/auth.js` | Password reset request |
| `POST /auth/change-password` | `routes/auth.js` | Force-change after temp password |
| `GET /announcements?since=` | `routes/announcements.js` | Employee reads announcements |
| `POST /announcements` | `routes/announcements.js` | Admin broadcasts message |
| `POST /faces/:id/enroll` | `routes/faces.js` | Admin APK enrolls face |
| `GET /faces/:id/status` | `routes/faces.js` | Check enrollment progress |
| `DELETE /faces/:id` | `routes/faces.js` | Re-enrollment reset |
| `GET /attendance/member/:id` | `routes/attendance.js` | Employee's own history |
| `PATCH /employees/:id` | `routes/employees.js` | Toggle `mobile_login_enabled` |

---

## Attendance Record — attendance_mode Values (full reference)

| Source | attendance_mode value | apk_source |
|---|---|---|
| Office biometric machine | `'office'` or machine type | `0` |
| Machine import (Jenix/ALOG/U5) | `'machine-import'` | `0` |
| Mobile app on tour | `'mobile-tour'` | `1` |
| Mobile app WFH | `'mobile-wfh'` | `1` |

HR/Owner can filter by `apk_source = 1` to see all mobile attendances.
Filter by `attendance_mode` to see tour vs WFH separately.
`allow_remote_attendance` is for branch-machine remote — not used by APK at all.
