# ESP32-S3 Gateway Handoff

## Scope

This folder contains the firmware for a `Jenix U5 Gateway` running on an `ESP32-S3 WROOM-1 N16R8`.

Current firmware behavior:

- joins site Wi-Fi in station mode while optionally keeping a setup SoftAP alive
- polls one or more U5 terminals over LAN HTTP
- parses `getWorkNoteList` from the response stream so `pic_large` is not buffered during regular polling
- forwards fresh attendance rows to Jenix
- surfaces backend `photoRequest` jobs and fetches one matching `pic_large` on demand
- stores gateway and per-slot state in `Preferences`
- exposes a first-run wizard plus an advanced support page
- reports heartbeat health to Jenix
- checks for OTA releases and can apply them from the device
- supports BOOT-button factory reset, serial fallback, status LED, and watchdog recovery

## Board target

- Module: `ESP32-S3 WROOM-1 N16R8`
- Flash: `16MB`
- PSRAM: `8MB`
- PlatformIO env: `esp32-s3-wroom-1-n16r8`

The custom board definition is in [esp32-s3-wroom-1-n16r8.json](/D:/IOT%20Device/Society/Jenix%20Community%20One/firmware/boards/esp32-s3-wroom-1-n16r8.json).

## Toolchain used

Latest confirmed local build: `August 14, 2026`

- PlatformIO platform: `espressif32 @ 6.13.0`
- Arduino framework package: `framework-arduinoespressif32 @ 3.20017.241212+sha.dcc1105b`
- Esptool: `tool-esptoolpy @ 4.11.0`
- Xtensa toolchain: `toolchain-xtensa-esp32s3 @ 8.4.0+2021r2-patch5`

Project config is in [platformio.ini](/D:/IOT%20Device/Society/Jenix%20Community%20One/firmware/platformio.ini).

## Project files

- [main.cpp](/D:/IOT%20Device/Society/Jenix%20Community%20One/firmware/src/main.cpp): thin Arduino entry wrapper
- [gateway_app.cpp](/D:/IOT%20Device/Society/Jenix%20Community%20One/firmware/src/gateway_app.cpp): full runtime, wizard, advanced UI, poll loop, OTA, health, serial commands
- [GatewayApp.h](/D:/IOT%20Device/Society/Jenix%20Community%20One/firmware/include/GatewayApp.h): wrapper interface
- [BootstrapConfig.h](/D:/IOT%20Device/Society/Jenix%20Community%20One/firmware/include/BootstrapConfig.h): first-boot seed values
- [platformio.ini](/D:/IOT%20Device/Society/Jenix%20Community%20One/firmware/platformio.ini): PlatformIO environments
- [esp32-s3-wroom-1-n16r8.json](/D:/IOT%20Device/Society/Jenix%20Community%20One/firmware/boards/esp32-s3-wroom-1-n16r8.json): custom board definition

## Build status

`pio run -e esp32-s3-wroom-1-n16r8` succeeds in this folder.

Last successful local build footprint:

- RAM: `47,496 / 327,680`
- Flash: `1,035,121 / 6,553,600`

## Provisioning flow

### Option 1: Wizard over SoftAP

If setup is incomplete, the root page serves the installer wizard.

- AP SSID format: `Jenix-U5-Setup-XXXX`
- AP password: derived from the chip MAC, format `jenixXXXXXX`
- AP portal IP: `http://192.168.4.1/`
- Captive-portal style routes are handled for Android, iOS/macOS, and Windows probe URLs

Wizard flow:

1. Scan or manually enter site Wi-Fi
2. Search local subnet for U5 devices
3. Verify U5 password via `/deviceLogin`
4. Verify Jenix API key via `/api/devices/verify/<apiKey>`
5. Save into a selected slot and finish, or save and continue to another slot

Important AP behavior:

- The firmware runs `WIFI_AP_STA` while joining Wi-Fi so the installer's phone stays attached to setup AP during onboarding.
- After `Save & Finish`, the setup AP is allowed to shut down only when station Wi-Fi is actually connected.
- The AP can also be forced on again later from the advanced page or serial.

### Option 2: Advanced page

Once setup is complete, `/` serves the advanced page and `/wizard` still opens the installer wizard.

The advanced page supports:

- raw Wi-Fi and per-slot editing
- Poll Now / Reconnect Wi-Fi / Reboot / Factory Reset
- force setup AP on or off
- Check For Updates / Apply Latest Update
- export settings
- import settings JSON

### Option 3: Serial console

Supported serial commands:

```text
help
show
set wifi.ssid YourWifiName
set wifi.password YourWifiPassword
set global.auto_update 1
set device.0.enabled 1
set device.0.label main-gate-u5
set device.0.u5_ip 192.168.1.92
set device.0.u5_password 123456
set device.0.push_base_url http://community.iotsoft.in/api/devices/push
set device.0.api_key your-real-device-api-key
set device.0.poll_ms 15000
portal-on
portal-off
poll-now
check-update
update-now
clear-last 0
reboot
factory-reset
```

## Runtime design

### Polling and dedupe

- Each enabled slot is polled serially, not in parallel.
- `getWorkNoteList` is parsed from `http.getStream()` using an ArduinoJson filter.
- Only newer rows than `last_checkin_unix` are forwarded.
- The dedupe marker is updated only after a successful push.
- Empty polls still issue an empty push so backend `photoRequest` work can surface without waiting for a new attendance event.

### Photo fetch

- Normal polling does not keep or forward `pic_large`.
- If the push response includes `photoRequest`, the gateway re-queries the U5, matches one record by `userid` plus `checkin_time`, extracts `pic_large`, and POSTs it to `/api/devices/photo/<apiKey>`.

### Health and OTA

- Heartbeat is sent per ready slot to `/api/devices/heartbeat/<apiKey>`.
- OTA metadata is read from `/api/devices/firmware/u5-gateway/latest`.
- OTA downloads use `WiFiClientSecure` with `setInsecure()`.
- The firmware verifies the downloaded SHA-256 before finalizing the update.
- On successful post-update health confirmation, the app marks the running OTA partition valid and cancels rollback.

### Reliability

- task watchdog enabled on the main loop
- logic watchdog restarts the device if both U5 polling and backend reachability stay stale for too long
- BOOT button held for about 10 seconds triggers factory reset
- built-in LED is used for status indication

## Config model

Global:

- Wi-Fi SSID/password
- `auto_update`
- `setup_done`

Per slot:

- enabled
- label
- `u5_ip`
- `u5_password`
- `push_base_url`
- `api_key`
- `poll_ms`
- `last_unix`

## Network assumptions

- U5 devices are reachable from the ESP32 on LAN using plain HTTP
- Jenix push and photo endpoints are reached over plain HTTP
- Jenix verify, heartbeat, and firmware endpoints are reached over HTTPS

## Flashing notes

- If upload stalls, press and hold `BOOT`, tap `RESET`, then release `BOOT` once upload begins.
- If Windows shows no serial port, try another USB cable first.

## Validation checklist after flashing

1. Confirm boot logs show firmware version, reset reason, AP state, and Wi-Fi state.
2. If using the wizard, complete Wi-Fi join, discovery, U5 verify, API-key verify, and save.
3. Confirm the board reports a station IP after Wi-Fi connects.
4. Trigger `Poll Now` from the advanced page or `poll-now` from serial.
5. Confirm polling reaches the U5 and pushes successfully to Jenix.
6. Confirm a `photoRequest` can be fulfilled for a recent event.
7. Confirm heartbeat calls land and update device health.
8. Confirm reboot does not resend already-forwarded rows.
9. Confirm BOOT-button hold performs a factory reset.
10. Confirm OTA check sees published releases and a manual update path works.

## Operational notes

- `factory-reset` clears `Preferences`, reseeds bootstrap values, and reopens setup AP.
- `clear-last <slot>` resets one slot's dedupe timestamp.
- Export/import is JSON over the local advanced page only.

## Known limitations

- OTA currently uses HTTPS with `setInsecure()` rather than a pinned CA chain.
- The wizard UI is intentionally simple and local-only; it is not a hardened remote admin surface.
- Discovery is optimized for common `/24` LANs and intentionally caps large-range scans down to a practical host sweep.
