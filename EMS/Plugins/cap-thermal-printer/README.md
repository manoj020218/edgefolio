# @jenix/cap-thermal-printer

Reusable Android thermal printer bridge for Jenix applications.

Current support:

- `ble`
- `usb`
- BLE scan with deduplicated discovery events
- BLE connect/disconnect with optional service and characteristic UUID hints
- USB enumeration with attach/detach events
- USB connect/disconnect with Android permission handoff
- Raw byte writes over BLE and USB with transport-specific chunking
- ESC/POS helpers for text, feed, cut, cash drawer, QR, and CODE128 barcodes
- Printer profile helpers for normalized BLE/USB device settings
- Bounded BLE auto-reconnect with surfaced connection state and last error details
- Connection state and error events

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

Standalone demo:

- Minimal demo UI lives under `demo/`.
- It is intentionally outside any existing Jenix application.
- The page talks directly to `window.Capacitor.Plugins.JenixThermalPrinter`.
- Use it inside a throwaway Android Capacitor shell to test BLE scan, USB listing, connect, print, and disconnect flows.

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
can be layered on top of `write()`.

ESC/POS helper example:

```ts
import { EscPosBuilder, ThermalPrinter } from '@jenix/cap-thermal-printer';

const receipt = new EscPosBuilder()
  .initialize()
  .align('center')
  .bold()
  .text('JENIX INDIA PVT LTD')
  .newline()
  .bold(false)
  .separator()
  .align('left')
  .text('Thermal Printer Test\n')
  .feed(2)
  .cut()
  .build();

await ThermalPrinter.write({ data: receipt });
await ThermalPrinter.printText({ text: 'Quick text path\n', alignment: 'center' });
await ThermalPrinter.printQRCode({ data: 'https://jenix.example/receipt/123', alignment: 'center', size: 6 });
await ThermalPrinter.printBarcode({ data: 'INV-123', format: 'code128', alignment: 'center', width: 3 });
```

Profile helper example:

```ts
import {
  ThermalPrinter,
  createPrinterProfile,
  profileToConnectionOptions,
} from '@jenix/cap-thermal-printer';

const profile = createPrinterProfile(device, {
  paperWidth: 58,
  charsPerLine: 32,
  autoReconnect: true,
  reconnectAttempts: 2,
  reconnectDelayMs: 1500,
});

await ThermalPrinter.connect(profileToConnectionOptions(profile));

const status = await ThermalPrinter.getStatus();
// status.connectionState: disconnected | connecting | connected | disconnecting | reconnecting
```

`printImage` remains reserved for a later phase. QR and barcode helpers currently support ASCII-only payloads.
