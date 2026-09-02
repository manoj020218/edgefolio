# @jenix/cap-thermal-printer

Reusable Android thermal printer bridge for Jenix applications.

Current support:

- `ble`
- BLE scan with deduplicated discovery events
- BLE connect/disconnect with optional service and characteristic UUID hints
- Raw byte writes with MTU-aware chunking and queued delivery
- Basic ESC/POS helpers for text, feed, cut, and cash drawer
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
```

`printQRCode`, `printBarcode`, and `printImage` remain reserved for later phases.
