# Jenix FieldForce EMS

Centralized MongoDB backend for the `prompt.txt` scope in [EMS/prompt.txt](D:/IOT%20Device/Salary_On/smart_salary/EdgeFolio/EMS/prompt.txt).

This service is intentionally separate from the existing `EDGE` SQLite backend and the mostly stubbed `VPS/src` cloud backend. The intended architecture is:

- `EDGE` / mobile level: local SQLite, offline-first
- `EMS`: centralized MongoDB system of record for field-force operations
- `VPS`: deployment/integration surface around the cloud backend

## Current Scope

Implemented modules under `src/modules/`:

- `auth`
- `companies`
- `users`
- `employees`
- `devices`
- `locations`
- `attendance`
- `visits`
- `calls`
- `recordings`
- `device-health`
- `notifications`
- `video-signalling`
- `audit`

Shared backend foundation:

- `src/app.ts`
- `src/config/db.ts`
- `src/config/env.ts`
- `src/middleware/auth.ts`
- `src/middleware/error-handler.ts`
- `src/middleware/validate.ts`
- `src/lib/*`

## Install

```bash
cd EMS
npm install
```

## Environment

Copy `.env.example` to `.env` and set:

- `MONGODB_URI`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_DEVICE_SECRET`
- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_PASSWORD`

Optional:

- `PORT`
- `ACCESS_TOKEN_TTL`
- `REFRESH_TOKEN_TTL_DAYS`
- `DEVICE_TOKEN_TTL_DAYS`
- `AUTH_RATE_LIMIT_MAX`
- `CORS_ORIGINS`

## Run

```bash
npm run dev
```

Production build:

```bash
npm run build
npm start
```

Validation:

```bash
npm run typecheck
npm run test
npm run check
```

## API Overview

Public auth:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

Protected resources:

- `GET/POST/PATCH /api/v1/companies`
- `GET/POST/PATCH /api/v1/users`
- `GET/POST/PATCH /api/v1/employees`
- `GET/POST/PATCH /api/v1/devices`
- `POST /api/v1/locations/batch`
- `GET /api/v1/locations/latest`
- `GET /api/v1/locations/latest/:employeeId`
- `GET /api/v1/locations/route/:employeeId`
- `POST /api/v1/attendance/check-in`
- `POST /api/v1/attendance/check-out`
- `GET /api/v1/attendance/today`
- `GET /api/v1/attendance/history`
- `POST /api/v1/visits/check-in`
- `POST /api/v1/visits/:id/check-out`
- `GET /api/v1/visits`
- `POST /api/v1/calls/ingest`
- `GET /api/v1/calls`
- `GET /api/v1/calls/summary/daily`
- `POST /api/v1/recordings`
- `GET /api/v1/recordings`
- `POST /api/v1/device-health/heartbeat`
- `GET /api/v1/device-health/:deviceId`
- `POST /api/v1/notifications/commands`
- `GET /api/v1/notifications/commands`
- `POST /api/v1/notifications/commands/:id/ack`
- `GET/POST /api/v1/video-sessions`
- `POST /api/v1/video-sessions/:id/answer`
- `POST /api/v1/video-sessions/:id/end`
- `GET /api/v1/audit`

## Existing EdgeFolio Reuse Boundaries

These existing files are useful references, but EMS does not import them directly because they are SQLite-oriented and model a different domain:

- `../EDGE/backend/controllers/authController.js`
  - Existing JWT login + password flow reference
- `../EDGE/backend/middleware/auth.js`
  - Existing route-role guard reference
- `../EDGE/backend/controllers/apkController.js`
  - Existing mobile attendance, FCM token, and APK-specific flow reference
- `../EDGE/backend/config/database.js`
  - Existing SQLite migration/reference logic
- `../APK/android/app/src/main/java/in/iotsoft/edgefolio/ui/login/LoginViewModel.kt`
  - Mobile login + token registration flow reference
- `../APK/android/app/src/main/java/in/iotsoft/edgefolio/ui/attendance/AttendanceViewModel.kt`
  - Face/GPS/offline sync flow reference

## VPS Notes

Useful context files:

- `../VPS/README.md`
- `../VPS/config/mongodb-config.js`
- `../VPS/migrations/mongodb-migrations.js`

Important current reality:

- `../VPS/src/` is still effectively empty/stubbed
- EMS therefore contains the actual working centralized backend implementation

## SQLite vs Mongo Boundary

Use Mongo in EMS for:

- multi-tenant companies
- centralized user/device/location/call/visit history
- audit trail
- centralized notification command queue

Keep SQLite in EDGE/mobile for:

- offline-first local capture
- temporary mobile sync buffers
- edge-side device locality and resilience

## Tests

Focused test files were added for:

- auth and login
- RBAC and tenant isolation
- duplicate location ingestion
- attendance open-session protection
- device registration and heartbeat
- call idempotent upsert

Files:

- `tests/auth-rbac.spec.ts`
- `tests/locations-attendance.spec.ts`
- `tests/devices-health.spec.ts`
- `tests/calls.spec.ts`

## Current Validation Limitation

As of `2026-08-18`, `npm install` did not complete in this environment, so dependency-backed `typecheck` and `test` execution could not be finished here. The source tree and tests were still added so the next machine with working registry access can run:

```bash
npm install
npm run check
```
