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

`printImage` remains reserved for a later phase. QR and barcode helpers currently support ASCII-only payloads.
