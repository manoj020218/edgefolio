# Native Plugins Handoff

Last updated: 2026-09-01

## 2026-09-01 Checkpoint

- Previously-blocked steps are **unblocked** — this was an environment/registry-access
  issue that session, not a real problem with the code:
  - `npm install` in `EMS/Plugins` now completes cleanly (113 packages, 0 vulnerabilities).
  - `npm run build` (workspaces) succeeds for **all 7 plugins** including `cap-dialer`
    and `cap-device-policy` — every package now has a real `dist/`.
  - `npm run test` (workspaces) — all test files pass across all 7 plugins.
- **A real Capacitor host app now exists and consumes 5 of these plugins**, resolving
  the "actual Capacitor host app / Android wrapper project was not found" blocker below:
  `APK/mobile/` in the EdgeFolio repo (React+TS+Capacitor rebuild of EdgeFolio's field-
  attendance APK, a *different* product from FieldForce — see that repo's
  `README_FIRST.md` §4 for the product boundary). It depends on `@jenix/cap-core`,
  `@jenix/cap-device-health`, `@jenix/cap-location`, `@jenix/cap-lifecycle`,
  `@jenix/cap-push` via local `file:` paths back into this folder — **not copies**, so
  changes here are picked up there automatically (npm's `file:` protocol linked, not
  copied, on this machine). `cap-dialer` and `cap-device-policy` are deliberately **not**
  used there — those stay FieldForce-only (call capture / MDM, wrong privacy footprint
  for a payroll app).
  - `npx cap add android` in `APK/mobile` auto-detected and registered all 5 plugins
    correctly (`Found 5 Capacitor plugins for android`) — plugin manifest/wiring is
    confirmed correct.
  - Not yet done: an actual `./gradlew assembleDebug` / on-device run — this dev
    environment has no Android SDK configured. Do that next on a machine with Android
    Studio installed.
- Still not started: real end-to-end device tests (background location while locked/
  killed, heartbeat, push commands, etc.) — needs the above Gradle build first.

## 2026-08-19 Checkpoint

- git checkpoint already pushed: `5bb513c` on `origin/master`
- validated locally:
  - `cap-core` config helper assertions passed
  - `cap-location` option-normalization assertions passed
  - physical Android device visible to `adb`: `2251eb032a78`
- attempted but still blocked:
  - workspace `npm run build` stops immediately because `rimraf` is not available in `Plugins/node_modules/.bin`
  - workspace `npm install` in `EMS/Plugins` did not complete during the session, so `@capacitor/core`, `@capacitor/android`, `vitest`, and other workspace binaries are still not fully available there
  - full workspace `npm run build`, `npm run test`, and `npm run check:lines` are not yet complete
  - actual Capacitor host app / Android wrapper project was not found in this repository, so plugin wiring and real end-to-end device tests have not started yet
- important note for continuation:
  - commit and push after each successful validation step to avoid losing progress if the session crashes

## cap-core

- status: implemented
- public API: `configure`, `setUserSession`, `registerDevice`, `getDeviceId`, `getNativeStatus`, `clearSession`
- native pieces: secure prefs, device ID, HTTP client, queue store, network status
- permissions: none beyond internet/network access
- backend endpoints: `POST /api/v1/devices/register`
- tests: base URL normalization and header redaction
- manual tests: configure, register, clear session, verify network event
- known limitations: Android source reuse is local-workspace based for now

## cap-device-health

- status: implemented
- public API: `getStatus`, `startHeartbeat`, `stopHeartbeat`, `sendHeartbeatNow`
- native pieces: heartbeat worker, status monitor, scheduler, uploader
- permissions: network access only
- backend endpoints: `POST /api/v1/device-health/heartbeat`
- tests: interval normalization
- manual tests: background heartbeat with app foreground, background, and killed
- known limitations: battery-change events depend on app process being alive

## cap-location

- status: implemented
- public API: `startTracking`, `stopTracking`, `getCurrentLocation`, `getTrackingStatus`, `getPendingCount`, `syncNow`, `checkPermissions`, `requestPermissions`
- native pieces: foreground service, queue store, sync worker, recovery receiver
- permissions: coarse, fine, background location, notifications, foreground service
- backend endpoints: `POST /api/v1/locations/batch`
- tests: tracking option normalization
- manual tests: locked screen + killed app, screen on + killed app, app visible
- known limitations: duplicate protection relies on timestamp/device dedupe

## cap-lifecycle

- status: implemented
- public API: `getLastBootState`, `getRecoveryStatus`
- native pieces: boot receiver, package-replaced receiver, recovery worker
- permissions: `RECEIVE_BOOT_COMPLETED`
- backend endpoints: none directly
- tests: recovery state mapping
- manual tests: reboot recovery and app update recovery
- known limitations: recovery uses supported broadcasts/work scheduling only

## cap-push

- status: implemented
- public API: `getToken`, `refreshRegistration`, `getPushStatus`, `dispatchPayload`
- native pieces: command router, token uploader, notification helper, event mailbox
- permissions: notifications, internet, network access
- backend endpoints: `PATCH /api/v1/devices/:deviceId/fcm-token`
- tests: command parsing
- manual tests: `SYNC_NOW`, `CONFIG_UPDATED`, `ADMIN_MESSAGE`, `DEVICE_STATUS_REQUEST`, `VIDEO_CALL`
- known limitations: host app must provide the single `FirebaseMessagingService`

## cap-dialer

- status: implemented
- public API: `isDefaultDialer`, `requestDefaultDialer`, `dial`, `getCallState`, `getRecentCalls`, `syncCalls`
- native pieces: dialer role helper, in-call service, call log reader, sync worker
- permissions: call phone, read call log, read phone state, bind in-call service
- backend endpoints: `POST /api/v1/calls/ingest`
- tests: external call ID formatting
- manual tests: incoming, outgoing, missed, rejected, failed, dual-SIM inspection
- known limitations: backend contract has no dual-SIM field, so it stays local

## cap-device-policy

- status: implemented
- public API: `getManagementStatus`, `getCapabilities`, `isDeviceOwner`, `isProfileOwner`
- native pieces: device admin receiver, capability reporter
- permissions: none beyond device admin configuration by host app
- backend endpoints: none directly
- tests: capability derivation
- manual tests: unmanaged, profile owner, device owner
- known limitations: read-only capability bridge, no privilege escalation

## Next Exact Step

1. Finish installing workspace dependencies in `EMS/Plugins` until `node_modules/.bin/rimraf` exists and the Capacitor packages are available there.
2. Run `npm run build`, `npm run test`, and `npm run check:lines` inside `EMS/Plugins`.
3. Locate the real Capacitor Android host app / wrapper project path and wire these plugin packages into it.
4. Use the connected device `2251eb032a78` to validate the physical-device scenarios listed above.
5. Commit and push after each successful test or fix checkpoint.
