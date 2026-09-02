# Hardware Test Checklist

BLE:

- Scan and confirm nearby printers appear once with stable device IDs.
- Scan with `namePrefix` and confirm non-matching devices are filtered out.
- Scan with `serviceUuid` and confirm matching devices are returned.
- Stop scan manually and confirm `scanStopped` fires with discovered devices.
- Deny permission and confirm the plugin returns `PERMISSION_DENIED`.

USB:

- Attach a USB printer and confirm enumeration returns vendor/product IDs.
- Accept the USB permission prompt and confirm the device becomes selectable.
- Reject the USB permission prompt and confirm a stable permission error is returned.

Shared:

- Confirm cached device lists reset on a new scan and remain deduplicated.
