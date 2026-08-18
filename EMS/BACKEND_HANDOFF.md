# EMS Backend Handoff

Last updated: 2026-08-18

## What Was Built

EMS now contains a new TypeScript + Express + MongoDB backend scaffold aligned to `prompt.txt`.

Implemented:

- shared app/bootstrap/config/middleware foundation
- JWT user auth
- refresh-token persistence
- role guard middleware
- multi-tenant company scoping pattern
- companies/users/employees APIs
- device registration/assignment/status APIs
- location batch ingest + route/latest APIs
- attendance check-in/check-out/history APIs
- customer visit check-in/check-out/list APIs
- call ingest/history/daily-summary APIs
- recording metadata API
- device heartbeat/current-health APIs
- notification command queue API
- video signalling session metadata API
- audit-log model + list API
- focused test suite skeleton using `mongodb-memory-server` + `supertest`

## Architecture Decisions

EMS is the centralized backend.

Boundary:

- `EDGE` stays local SQLite and offline-first
- `EMS` stores centralized Mongo records
- `VPS` is not yet the source of truth for this logic because `VPS/src` is still empty

This means EMS does not directly reuse runtime code from `EDGE`. It only reuses concepts and API/flow references.

## Existing EdgeFolio References

Reference-only files already available elsewhere in the repo:

- `../EDGE/backend/controllers/authController.js`
  - JWT login/password reset reference
- `../EDGE/backend/middleware/auth.js`
  - simple role middleware reference
- `../EDGE/backend/controllers/apkController.js`
  - mobile attendance / FCM / employee-app flow reference
- `../EDGE/backend/config/database.js`
  - SQLite migrations and field evolution reference
- `../APK/android/app/src/main/java/in/iotsoft/edgefolio/ui/login/LoginViewModel.kt`
  - login + FCM registration flow
- `../APK/android/app/src/main/java/in/iotsoft/edgefolio/ui/attendance/AttendanceViewModel.kt`
  - attendance submission + offline sync flow
- `../VPS/README.md`
  - cloud role and deployment intent

Non-reusable as-is because of architecture mismatch:

- SQLite models and SQL queries in `EDGE`
- empty placeholder code in `VPS/src`

## Important Files In EMS

Foundation:

- `src/app.ts`
- `src/server.ts`
- `src/config/env.ts`
- `src/config/db.ts`
- `src/middleware/auth.ts`
- `src/middleware/error-handler.ts`
- `src/middleware/validate.ts`

Key module entry points:

- `src/modules/auth/routes.ts`
- `src/modules/companies/routes.ts`
- `src/modules/users/routes.ts`
- `src/modules/employees/routes.ts`
- `src/modules/devices/routes.ts`
- `src/modules/locations/routes.ts`
- `src/modules/attendance/routes.ts`
- `src/modules/visits/routes.ts`
- `src/modules/calls/routes.ts`
- `src/modules/recordings/routes.ts`
- `src/modules/device-health/routes.ts`
- `src/modules/notifications/routes.ts`
- `src/modules/video-signalling/routes.ts`
- `src/modules/audit/routes.ts`

## Indexes / Data Rules

Implemented important indexes in Mongoose schemas:

- company code unique
- user email unique
- employee `(companyId, employeeCode)` unique
- device `deviceId` unique
- locations `(companyId, employeeId, deviceId, timestamp)` unique
- attendance partial unique open session per employee
- calls `(deviceId, externalCallId)` unique
- audit `(companyId, timestamp)` indexed

## What Is Still Thin Or Deferred

These are intentionally minimal, not absent:

- notification delivery is a command queue/metadata layer only
- recording storage is metadata-only via `StorageProvider`
- video signalling is session metadata only
- stop detection analytics are not implemented beyond raw route history
- no frontend was added
- no Android/Kotlin plugin work was started

## Validation Status

Source files were created and constrained to under 200 lines each.

Blocked in this environment:

- `npm install`
- `npm run typecheck`
- `npm run test`

Observed issue:

- install attempts timed out repeatedly in this environment, including an unrestricted retry

## Exact Next Step

On a machine with working npm registry access:

1. Run `npm install` in `EMS/`
2. Run `npm run check`
3. Fix any TypeScript/Mongoose typing issues surfaced by real compilation
4. Wire EMS into the actual VPS deployment path
5. Coordinate with the VPS/EDGE developer for SQLite-to-Mongo sync contracts where required

## Practical Integration Note

If another developer owns the deployed `VPS` Mongo layer, they should treat EMS as the application-service reference and then:

- merge or port these modules into `VPS/src`
- keep `EDGE` local SQLite for offline mode
- build sync contracts from `EDGE/APK` into EMS Mongo collections
