# Hardware Test Checklist

BLE:

- Scan and confirm nearby printers appear once with stable device IDs.
- Scan with `namePrefix` and confirm non-matching devices are filtered out.
- Scan with `serviceUuid` and confirm matching devices are returned.
- Stop scan manually and confirm `scanStopped` fires with discovered devices.
- Connect to a scanned device by `deviceId` and confirm `connected` plus `getStatus()`.
- Connect with explicit `serviceUuid` and `writeCharacteristicUuid` when known.
- Send a short raw receipt (`ESC @`, text, feed) and confirm the printer outputs it.
- Send a long raw receipt that exceeds one BLE packet and confirm chunked printing succeeds.
- Send `printText`, `feed`, `cut`, and `openCashDrawer` commands and confirm the helper APIs map to printer behavior.
- Disconnect manually and confirm `disconnected` plus `isConnected() === false`.
- Power off or move the printer out of range while connected and confirm disconnect/error events.
- Deny permission and confirm the plugin returns `PERMISSION_DENIED`.

USB:

- Attach a USB printer and confirm enumeration returns vendor/product IDs.
- Accept the USB permission prompt and confirm the device connects successfully.
- Reject the USB permission prompt and confirm a stable permission error is returned.
- Connect by `deviceId` when multiple USB printers are attached.
- Send a short raw receipt and confirm bulk OUT printing succeeds.
- Disconnect manually and confirm `disconnected` plus `isConnected() === false`.
- Unplug the printer while connected and confirm `usbDetached` plus disconnect/error events.

Shared:

- Confirm cached device lists reset on a new scan and remain deduplicated.
- Confirm write attempts without an active connection return `NOT_CONNECTED`.
