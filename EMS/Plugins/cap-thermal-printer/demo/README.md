# Thermal Printer Demo

This demo keeps Phase 9 inside `cap-thermal-printer` and avoids touching any existing Jenix app.

Files:

- `index.html`
- `demo.css`
- `demo.js`
- `receipt.js`

How to use it:

1. Create a throwaway Android Capacitor shell app.
2. Install this plugin into that shell app.
3. Copy these demo files into the shell app web root.
4. Load `index.html` as the app entry page.
5. Run `npx cap sync android`.
6. Open the shell app on an Android device with BLE or USB printers available.

The page talks directly to `window.Capacitor.Plugins.JenixThermalPrinter`, so it does not depend on React, Vite, or any existing application routes.

What it covers:

- Scan BLE printers
- Stop scan
- List USB printers
- Connect BLE
- Connect USB
- Print a test receipt
- Disconnect
- View status and event log

Known limits:

- Android only
- Requires a Capacitor shell with this plugin installed
- `printImage` is still not implemented in the plugin
