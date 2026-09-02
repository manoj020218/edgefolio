# @jenix/cap-thermal-printer

Reusable Android thermal printer bridge for Jenix applications.

Current support:

- `ble`
- BLE scan with deduplicated discovery events
- BLE connect/disconnect with optional service and characteristic UUID hints
- Raw byte writes with MTU-aware chunking and queued delivery
- Connection state and error events

Planned transport support:

- `usb`

Planned public API:

- `scan`
- `stopScan`
- `getDevices`
- `connect`
- `disconnect`
- `isConnected`
- `getStatus`
- `write`
- `printText`
- `feed`
- `printQRCode`
- `printBarcode`
- `printImage`
- `cut`
- `openCashDrawer`

Current implementation is Android-only. The web shim returns unsupported errors.

Raw write example:

```ts
import { ThermalPrinter } from '@jenix/cap-thermal-printer';

await ThermalPrinter.connect({
  transport: 'ble',
  deviceId: 'AA:BB:CC:DD:EE:FF',
});

await ThermalPrinter.write({
  data: [0x1b, 0x40, ...new TextEncoder().encode('JENIX PRINTER TEST\n\n')],
});
```

Higher-level ESC/POS helpers such as `printText`, `feed`, `cut`, QR, and barcode
are scheduled for the next phases and currently return unsupported-operation errors.
