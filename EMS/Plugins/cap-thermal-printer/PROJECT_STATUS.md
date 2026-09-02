# Thermal Printer Status

Updated: 2026-09-02

Completed phase:

- Phase 0: repository integration

Important architecture decisions:

- Follow repository workspace naming with package `@jenix/cap-thermal-printer`.
- Use Capacitor plugin name `JenixThermalPrinter`.
- Keep receipt formatting and ESC/POS composition in TypeScript.
- Keep Android native code transport-focused so BLE and USB can share one API.

Implementation plan:

1. Phase 1: add core printer models, transport-facing types, byte helpers, and tests.
2. Phase 2: add Android BLE scan, permission handling, and device discovery events.
3. Phase 3: add BLE connect, characteristic discovery, chunked raw writes, and status.
4. Phase 4+: add ESC/POS helpers, USB transport, profiles, demo, and docs in order.

Files added or changed:

- `package.json`
- `cap-thermal-printer/package.json`
- `cap-thermal-printer/tsconfig.json`
- `cap-thermal-printer/README.md`
- `cap-thermal-printer/PROJECT_STATUS.md`
- `cap-thermal-printer/src/definitions.ts`
- `cap-thermal-printer/src/index.ts`
- `cap-thermal-printer/src/web.ts`
- `cap-thermal-printer/android/build.gradle`
- `cap-thermal-printer/android/src/main/AndroidManifest.xml`
- `cap-thermal-printer/android/src/main/java/com/jenix/cap/thermalprinter/ThermalPrinterPlugin.kt`

Current build status:

- `npm run build --workspace @jenix/cap-thermal-printer` passed on 2026-09-02.
- No package tests exist yet for Phase 0.

Next phase:

- Phase 1: core models and transport abstraction.
