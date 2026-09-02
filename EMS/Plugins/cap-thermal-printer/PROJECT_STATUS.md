# Thermal Printer Status

Updated: 2026-09-02

Completed phase:

- Phase 0: repository integration
- Phase 1: core models, transport contract, byte helpers, and shared errors

Important architecture decisions:

- Follow repository workspace naming with package `@jenix/cap-thermal-printer`.
- Use Capacitor plugin name `JenixThermalPrinter`.
- Keep receipt formatting and ESC/POS composition in TypeScript.
- Keep Android native code transport-focused so BLE and USB can share one API.
- Separate transport kind types from the `PrinterTransport` interface to keep BLE and USB implementations swappable.
- Use `number[]` as the public raw byte shape and normalize internally to `Uint8Array`.
- Use ASCII fallback encoding for the initial text path so unsupported characters degrade predictably.

Implementation plan:

1. Phase 2: add Android BLE scan, permission handling, and device discovery events.
2. Phase 3: add BLE connect, characteristic discovery, chunked raw writes, and connection status.
3. Phase 4: add basic ESC/POS builders on top of the raw write path.
4. Phase 5+: add USB transport, profiles, demo usage, and final documentation in order.

Files added or changed:

- `package.json`
- `cap-thermal-printer/package.json`
- `cap-thermal-printer/tsconfig.json`
- `cap-thermal-printer/README.md`
- `cap-thermal-printer/PROJECT_STATUS.md`
- `cap-thermal-printer/src/definitions.ts`
- `cap-thermal-printer/src/bytes.ts`
- `cap-thermal-printer/src/errors.ts`
- `cap-thermal-printer/src/index.ts`
- `cap-thermal-printer/src/transport.ts`
- `cap-thermal-printer/src/web.ts`
- `cap-thermal-printer/src/bytes.test.ts`
- `cap-thermal-printer/src/errors.test.ts`
- `cap-thermal-printer/android/build.gradle`
- `cap-thermal-printer/android/src/main/AndroidManifest.xml`
- `cap-thermal-printer/android/src/main/java/com/jenix/cap/thermalprinter/ThermalPrinterPlugin.kt`

Current build status:

- `npm run build --workspace @jenix/cap-thermal-printer` passed on 2026-09-02.
- `npm run test --workspace @jenix/cap-thermal-printer` passed on 2026-09-02.

Next phase:

- Phase 2: Android BLE scan and permission handling.
