# Thermal Printer Status

Updated: 2026-09-03

Completed phase:

- Phase 0: repository integration
- Phase 1: core models, transport contract, byte helpers, and shared errors
- Phase 2: Android BLE scan, permissions, deduplicated discovery, and scan events
- Phase 3: Android BLE connect, writable characteristic discovery, queued raw writes, and connection status
- Phase 4: TypeScript ESC/POS helpers for text, feed, cut, cash drawer, and receipt composition
- Phase 5: Android USB discovery, permission handoff, and attach/detach events
- Phase 6: Android USB connect, bulk OUT endpoint discovery, and raw writes
- Phase 7: TypeScript ESC/POS QR and CODE128 barcode helpers
- Phase 8: printer profile helpers, bounded BLE reconnect handling, and status refinements
- Phase 9: standalone demo UI for scan, connect, print, and disconnect testing

Important architecture decisions:

- Follow repository workspace naming with package `@jenix/cap-thermal-printer`.
- Use Capacitor plugin name `JenixThermalPrinter`.
- Keep receipt formatting and ESC/POS composition in TypeScript.
- Keep Android native code transport-focused so BLE and USB can share one API.
- Separate transport kind types from the `PrinterTransport` interface to keep BLE and USB implementations swappable.
- Use `number[]` as the public raw byte shape and normalize internally to `Uint8Array`.
- Use ASCII fallback encoding for the initial text path so unsupported characters degrade predictably.
- Split BLE discovery into small Kotlin files for the scanner, payload helpers, and plugin bridge.
- Use runtime permission alias `ble` on Android 12+ and `location` on Android 11 and below for scanning.
- Cache BLE discoveries per scan, emit `deviceFound` once per unique device, and return the deduplicated snapshot when scanning stops.
- Keep scan state and active BLE connection state separate so later USB work can share the public API without reusing scan caches as connection state.
- Prefer caller-supplied BLE service and characteristic UUIDs when available, otherwise discover the first writable characteristic and prefer `WRITE_NO_RESPONSE`.
- Queue raw BLE writes natively and derive chunk size from negotiated MTU with a conservative 20-byte minimum fallback.
- Keep high-level ESC/POS composition in TypeScript by exporting helpers/builders and implementing convenience methods as wrappers over native `write()`.
- Support only ASCII text encoding in the initial ESC/POS layer so unsupported glyphs degrade predictably instead of sending printer-specific code pages prematurely.
- Treat USB devices as printer candidates when they expose either a printer-class interface or any bulk OUT endpoint, so discovery stays generic across ESC/POS hardware.
- Reuse `connect({ transport: 'usb' })` as the Android USB permission entry point in Phase 5, then open and claim the device in Phase 6 after permission has already been granted.
- Register one runtime USB monitor for permission, attach, and detach broadcasts, and serialize pending USB permission requests to avoid overlapping connect races.
- Resolve USB writes against a claimed interface with a bulk OUT endpoint, preferring printer-class interfaces first and falling back to other bulk OUT interfaces only when needed.
- Serialize USB raw writes through a single native executor so the public `write()` API stays transport-independent and concurrent print calls do not interleave.
- Share one parsed native raw-byte payload model for BLE and USB so both transports accept the same Capacitor `number[]` write contract.
- Keep QR and barcode command composition in TypeScript as transport-independent `write()` wrappers, matching the existing text/feed/cut helper pattern.
- Limit the initial barcode helper to CODE128 with automatic Code Set B selection and brace escaping, and keep QR/barcode payloads ASCII-only to avoid silent machine-readable data corruption.
- Normalize stored BLE and USB printer profiles in TypeScript before connecting so apps can persist safe defaults without duplicating validation rules.
- Surface reconnect progress through `connectionState`, reconnect counters, and `lastError`, while keeping BLE retries bounded and opt-in.
- Keep the demo isolated under the plugin folder and talk to `window.Capacitor.Plugins.JenixThermalPrinter` directly so no existing app routes or build pipelines need to be modified.

Implementation plan:

1. Phase 10: finish installation, usage, Android requirements, and limitation documentation around the completed demo flow.

Files added or changed:

- `package.json`
- `cap-thermal-printer/package.json`
- `cap-thermal-printer/tsconfig.json`
- `cap-thermal-printer/README.md`
- `cap-thermal-printer/PROJECT_STATUS.md`
- `cap-thermal-printer/HARDWARE_TEST_CHECKLIST.md`
- `cap-thermal-printer/demo/index.html`
- `cap-thermal-printer/demo/demo.css`
- `cap-thermal-printer/demo/demo.js`
- `cap-thermal-printer/demo/receipt.js`
- `cap-thermal-printer/demo/README.md`
- `cap-thermal-printer/src/definitions.ts`
- `cap-thermal-printer/src/bytes.ts`
- `cap-thermal-printer/src/errors.ts`
- `cap-thermal-printer/src/index.ts`
- `cap-thermal-printer/src/profile.ts`
- `cap-thermal-printer/src/profile.test.ts`
- `cap-thermal-printer/src/escpos/barcode.ts`
- `cap-thermal-printer/src/escpos/barcode.test.ts`
- `cap-thermal-printer/src/escpos/builder.ts`
- `cap-thermal-printer/src/escpos/commands.ts`
- `cap-thermal-printer/src/escpos/index.ts`
- `cap-thermal-printer/src/escpos/qrcode.ts`
- `cap-thermal-printer/src/escpos/qrcode.test.ts`
- `cap-thermal-printer/src/escpos/builder.test.ts`
- `cap-thermal-printer/src/escpos/commands.test.ts`
- `cap-thermal-printer/src/transport.ts`
- `cap-thermal-printer/src/web.ts`
- `cap-thermal-printer/src/bytes.test.ts`
- `cap-thermal-printer/src/errors.test.ts`
- `cap-thermal-printer/android/build.gradle`
- `cap-thermal-printer/android/src/main/AndroidManifest.xml`
- `cap-thermal-printer/android/src/main/java/com/jenix/cap/thermalprinter/BlePrinterDevice.kt`
- `cap-thermal-printer/android/src/main/java/com/jenix/cap/thermalprinter/BleConnectionSupport.kt`
- `cap-thermal-printer/android/src/main/java/com/jenix/cap/thermalprinter/BleGattCallback.kt`
- `cap-thermal-printer/android/src/main/java/com/jenix/cap/thermalprinter/BleGattSupport.kt`
- `cap-thermal-printer/android/src/main/java/com/jenix/cap/thermalprinter/BlePrinterConnection.kt`
- `cap-thermal-printer/android/src/main/java/com/jenix/cap/thermalprinter/BlePrinterScanner.kt`
- `cap-thermal-printer/android/src/main/java/com/jenix/cap/thermalprinter/BleScanSupport.kt`
- `cap-thermal-printer/android/src/main/java/com/jenix/cap/thermalprinter/BleWriteRequest.kt`
- `cap-thermal-printer/android/src/main/java/com/jenix/cap/thermalprinter/BleWriteSession.kt`
- `cap-thermal-printer/android/src/main/java/com/jenix/cap/thermalprinter/PrinterPluginSupport.kt`
- `cap-thermal-printer/android/src/main/java/com/jenix/cap/thermalprinter/PrinterWriteSupport.kt`
- `cap-thermal-printer/android/src/main/java/com/jenix/cap/thermalprinter/ThermalPrinterPlugin.kt`
- `cap-thermal-printer/android/src/main/java/com/jenix/cap/thermalprinter/UsbPrinterDevice.kt`
- `cap-thermal-printer/android/src/main/java/com/jenix/cap/thermalprinter/UsbConnectionSupport.kt`
- `cap-thermal-printer/android/src/main/java/com/jenix/cap/thermalprinter/UsbPrinterConnection.kt`
- `cap-thermal-printer/android/src/main/java/com/jenix/cap/thermalprinter/UsbPrinterMonitor.kt`
- `cap-thermal-printer/android/src/main/java/com/jenix/cap/thermalprinter/UsbSupport.kt`

Current build status:

- `npm run build --workspace @jenix/cap-thermal-printer` passed on 2026-09-03.
- `npm run test --workspace @jenix/cap-thermal-printer` passed on 2026-09-03.
- `node --check demo/demo.js` passed on 2026-09-03.
- `node --check demo/receipt.js` passed on 2026-09-03.
- Standalone demo assets are ready, but no throwaway Android Capacitor shell has been run for end-to-end demo execution in this phase.
- Hardware verification remains pending; use `HARDWARE_TEST_CHECKLIST.md`.

Next phase:

- Phase 10: documentation and final verification.
