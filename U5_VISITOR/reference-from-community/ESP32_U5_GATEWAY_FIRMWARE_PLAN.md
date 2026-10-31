# ESP32-S3 U5 Gateway — Firmware Plan

## What this device does

A dedicated, always-on hardware bridge that sits on the same LAN as a U5 terminal, polls it for new attendance records, and forwards them to the Jenix backend. **Read `U5_DEVICE_INTEGRATION_HANDOFF.md` first** — the poll/parse/push protocol below is a direct hardware port of a solution already proven working against real hardware; nothing about it is speculative.

This document also specifies everything needed to take it from "works on a bench" to **professional field-deployable gear**: a guided setup wizard a non-technical installer can complete in under two minutes, auto-discovery of the U5 on the LAN, OTA updates, firmware versioning, remote health reporting, and the reliability engineering needed for a device meant to run unattended for years. Every network contract referenced below (`/verify`, `/heartbeat`, `/firmware/.../latest`, the firmware-release registry) is **already built and live** on the Jenix backend — this isn't aspirational, it's ready to build against today.

**Photos stay on the U5 device by default.** `pic_large` (the base64 JPEG per attendance record) must never be parsed into a buffer or forwarded during **regular polling**. There is one deliberate exception — **on-demand fetch** (below), for when an admin explicitly needs to see one specific record's photo.

> **Status note (2026-08-14):** an earlier firmware build already has the core poll → parse → push loop working end-to-end against real hardware (verified live), plus a multi-slot config UI (up to 6 device slots, WiFi setup, Poll Now/Reboot/Factory Reset actions) already shipped. That build forwards `pic_large` unfiltered on every regular poll, which the filtered-parse approach below fixes — Jenix strips it server-side as a backstop either way, but the firmware should stop sending it to save bandwidth. Everything from "Guided Setup Wizard" onward in this document is new, layered on top of that working base — the existing multi-slot page should be kept as the **advanced/support** view, not replaced.

---

## Hardware

- **ESP32-S3** (any dev board — WROOM-1 or similar; PSRAM not required given the filtering approach below, but doesn't hurt if the board has it).
- WiFi only needed — no Ethernet, no display required. The board's built-in LED is enough for status signaling (see [Field Reliability Engineering](#field-reliability-engineering-10-year-unattended-target)). Access to the BOOT button (present on virtually every ESP32-S3 dev board) is used for a physical factory-reset fallback.

---

## Network topology

```
[U5 terminal]  --- LAN, plain HTTP ---  [ESP32-S3]  --- WiFi/internet ---  [Jenix VPS]
192.168.1.92                                                    community.iotsoft.in
```

Telemetry (poll/push/heartbeat) stays **plain HTTP, no TLS** — confirmed working, and the U5 terminal itself only ever supports plain HTTP. **OTA firmware downloads are the one exception and must use HTTPS** (see [OTA Firmware Updates](#ota-firmware-updates)) — fetching executable code over an unencrypted, unauthenticated channel is a materially different risk than telemetry.

---

## Step 1 — Pull from the U5 device

```
POST http://192.168.1.92/getWorkNoteList
Content-Type: application/json
Body: {"password":"123456","type":2}
```

Response shape:
```json
{
  "result": 0,
  "data": [
    {
      "userid": "2120152124",
      "name": "Manoj jain",
      "checkin_time": "2026-08-13 20:31:13",
      "ispass": 1,
      "id_number": "...",
      "temp": 0,
      "pic_large": "<hundreds of KB of base64 — DO NOT PARSE INTO MEMORY>"
    },
    ...
  ]
}
```
`result: 0` = success. `checkin_time` is `"YYYY-MM-DD HH:MM:SS"`, in the device's own local clock (this exact unit defaults to China Standard Time / UTC+8 — the Jenix backend already handles this conversion server-side; **the firmware should forward `checkin_time` as-is, unconverted**).

### Parsing this safely (the whole point of this plan)

Use **ArduinoJson v7**, `deserializeJson` with a **filter document** and a **Stream input** (not a fully-buffered string):

```cpp
#include <ArduinoJson.h>
#include <HTTPClient.h>

// Filter: only keep the fields we actually want. Everything else — pic_large
// included — is skipped by the parser without being buffered or allocated.
StaticJsonDocument<256> filter;
filter["result"] = true;
JsonObject filterData = filter["data"].createNestedObject();
filterData["userid"] = true;
filterData["name"] = true;
filterData["checkin_time"] = true;
filterData["ispass"] = true;
filterData["id_number"] = true;

HTTPClient http;
http.begin("http://192.168.1.92/getWorkNoteList");
http.addHeader("Content-Type", "application/json");
int code = http.POST("{\"password\":\"123456\",\"type\":2}");

if (code == 200) {
  JsonDocument doc; // ArduinoJson v7 auto-sized, small because of the filter
  DeserializationError err = deserializeJson(
    doc, http.getStream(),
    DeserializationOption::Filter(filter)
  );
  // doc now contains ONLY result + data[].{userid,name,checkin_time,ispass,id_number}
  // pic_large was never allocated.
}
http.end();
```

**Do not** call `http.getString()` first and then `deserializeJson` on the resulting `String` — that defeats the whole point by buffering the full (photo-laden) response before parsing. Always parse directly from `http.getStream()`.

---

## Step 2 — Deduplicate

- Store the last-forwarded `checkin_time` (as a Unix timestamp, converted from the `"YYYY-MM-DD HH:MM:SS"` string) in NVS via the `Preferences` library, per slot — flash-backed, survives power loss/reboot. **Only write when the value actually changes** (compare before write) — see [Field Reliability Engineering](#field-reliability-engineering-10-year-unattended-target).
- On each poll, only forward records with `checkin_time` strictly newer than the stored value.
- After a successful push (Step 3), update the stored value to the newest `checkin_time` among the records just sent.

---

## Step 3 — Push to Jenix

```
POST http://community.iotsoft.in/api/devices/push/<apiKey>
Content-Type: application/json
Body: { "data": [ { "userid": "...", "name": "...", "checkin_time": "...", "ispass": 1 }, ... ] }
```

Build this JSON with a small `JsonDocument` (only the filtered fields, so it's tiny) and `serializeJson`.

Expected response: `{"success": true, "data": {"received": <n>, "warning": null, "photoRequest": null}}`, HTTP 200. Only advance the NVS-stored timestamp if this returns 200 — if the push fails, retry on the next poll cycle rather than losing the record. **Check `photoRequest` on every response regardless of whether it's usually null** — see [On-Demand Photo Fetch](#on-demand-photo-fetch-audit--incident-lookup).

The `apiKey` is a per-device secret from Jenix (Devices page → "Push URL & Event Log" on the relevant device card). Treat it as sensitive — anyone with it can post fake attendance events. Store it in `Preferences`, never hardcoded in source control.

---

## Step 4 — Loop

- Poll interval: 15–30s, configurable per slot (already exposed as `Poll ms` in the existing config UI).
- Standard ESP32 WiFi reliability pattern: `WiFi.onEvent` (or a periodic `WiFi.status() != WL_CONNECTED` check) to auto-reconnect on drop.
- A watchdog timer is required, not optional — see [Field Reliability Engineering](#field-reliability-engineering-10-year-unattended-target).

---

## On-Demand Photo Fetch (audit / incident lookup)

**Why this exists:** photos are never fetched or sent during regular polling — but for an audit or safety incident, an admin sometimes needs to see one specific record's snapshot. Rather than always sending every photo, Jenix can ask *this gateway* to fetch *one specific* photo, on demand, only when a human requests it. Nothing is cached anywhere — not on the gateway, not on the VPS (server-side: held in memory only, never written to disk/DB, deleted the moment it's been shown once).

**There is no direct path for Jenix to call this gateway** (no port-forwarding, no public IP) — the request rides the same poll channel already working, so it takes up to one poll interval to be noticed (~15–30s), not instant. Fine for this use case.

### The flow

1. An admin in the Jenix UI clicks "Fetch photo" against a specific attendance record (identified by `userid` + `checkin_time`, exactly as this gateway already sends them).
2. On your gateway's **next regular poll**, the push response (Step 3) will include a non-null `photoRequest`:
   ```json
   { "success": true, "data": { "received": 0, "warning": null,
     "photoRequest": { "requestId": "a1b2c3...", "deviceExternalUserId": "2120152124", "checkinTime": "2026-08-14 13:06:37" } } }
   ```
   `checkinTime` is already in the device's own local time format — match it as an exact string against `checkin_time` from `/getWorkNoteList`.
3. Make **one more call** to `POST http://<u5-ip>/getWorkNoteList` (same as Step 1), but this time **do not filter out `pic_large`** — walk the response looking for the single record whose `userid` matches `deviceExternalUserId` and whose `checkin_time` matches `checkinTime`. Extract only that one record's `pic_large`. Discard everything else immediately.
4. POST just that one photo:
   ```
   POST http://community.iotsoft.in/api/devices/photo/<apiKey>
   Content-Type: application/json
   Body: { "requestId": "a1b2c3...", "photoBase64": "<the pic_large value, unchanged>" }
   ```
   Expected response: `{"success": true}`, HTTP 200. If no matching record is found (e.g. aged out of the device's own local buffer), it's fine to skip this call — the request simply expires on the Jenix side and the admin sees a "no response" message.
5. Go back to normal polling. Free the photo buffer/string immediately after the POST completes — this is the *only* place in the firmware where a full photo is ever parsed into RAM, and it should happen at most once per human-initiated request.

---

## Guided Setup Wizard (SoftAP onboarding)

**Goal:** an on-site installer with no training connects two devices and is done in under two minutes. No typing IP addresses, no reading this document, no guessing.

*(The existing serial-console provisioning path — `set wifi.ssid ...`, `set device.0.api_key ...`, etc. — stays exactly as-is; it's a genuinely useful developer/support fallback and nothing here removes it. This section is specifically about the field-installer experience, which today requires typing raw IPs and keys into flat form fields.)*

### Screen 0 — Captive portal trigger

The device already boots into a SoftAP (`Jenix-U5-Setup-XXXX`, password `jenix12345` — currently fixed in firmware, worth deriving from the chip ID like the SSID suffix already is, so units don't all share one password — `192.168.4.1`) when unconfigured. Make connecting to it auto-open the setup page, the way hotel/airport WiFi does:

- Run a `DNSServer` that resolves **every** DNS query to `192.168.4.1`.
- Respond to the specific probe URLs each OS uses to detect a captive portal, in a way that triggers its "Sign in to network" popup (redirect or non-matching response, not the value the OS expects for "internet is fine"):
  - Android: `GET /generate_204` — must NOT return a bare 204.
  - iOS/macOS: `GET /hotspot-detect.html`.
  - Windows: `GET /connecttest.txt` and `GET /redirect`.
- Fallback safety net regardless of whether the popup fires: since DNS is hijacked, navigating to *any* `http://` address from a connected device lands on the wizard anyway.

### Screen 1 — Welcome

"Jenix U5 Gateway Setup" + one button: **Start Setup**.

### Screen 2 — Connect to WiFi

- Run `WiFi.scanNetworks()` once per wizard session (takes ~2–3s, show a spinner), return results as a JSON list sorted by signal strength.
- UI: tap a network from the list (show signal bars), password field appears, **Connect**. Always offer a "enter manually" fallback for hidden networks.
- Run in `WIFI_AP_STA` mode (AP **and** station simultaneously) while joining — this keeps the installer's phone connected to the setup AP and the wizard page responsive while the station-mode join happens in the background. Poll `WiFi.status()` every 500ms via AJAX from the page; on `WL_CONNECTED` show a green check and advance. On failure/timeout (~15s), show a clear error and let them retry or re-pick.

### Screen 3 — Find the U5 device

- Once station WiFi is up, run [Auto-Discovery](#auto-discovery-of-the-u5-device-on-the-lan) automatically — show "Searching your network... (~10–15s)".
- Results as a list: IP + serial number + firmware version (all free from `/getDeviceVersion`, fetched during discovery). One found → pre-selected with a confirm button (don't silently auto-advance — let the installer notice if something's off). Multiple found → let them pick. Zero found → show a manual-IP-entry fallback and a **Retry Search** button.
- After finishing one device, offer **"Add another gate"** to loop back and configure a second slot (matches the existing "entry gate / exit gate" precedent already in the shipped multi-slot config).

### Screen 4 — Verify U5 login

- Password field, pre-filled with the known factory default `123456` (saves typing in the overwhelmingly common case), editable.
- **Verify** button calls `POST http://<selected-ip>/deviceLogin` — green "Connected!" or red "Wrong password, try again." The wizard must not let the installer continue past a failed check.

### Screen 5 — Jenix API key

- One text field: "Paste the API key from the Jenix Devices page." A plain `<input type="text">` already supports OS-level copy/paste (long-press-paste on phone, Ctrl+V on laptop) with zero extra code — this works regardless of HTTP/HTTPS, it's normal form input, not a JS clipboard API. Add a **Paste** button as a nice-to-have via `navigator.clipboard.readText()`, but treat it as progressive enhancement: catch failures silently and let normal paste still work — never make it the *only* way to get the key in.
- **Test Connection** button calls `GET https://community.iotsoft.in/api/devices/verify/<pasted-key>` (built, live). On success show: **"✓ Connected to: {societyName} — {deviceName}"** (e.g. "Connected to: Krishna Nagar — Main Gate U5") — unambiguous human confirmation the right key was pasted for the right gate. On 401, clear error, don't let them proceed.

### Screen 6 — Review & save

- Summary: WiFi SSID, U5 IP + serial, Jenix society/device name.
- **Save & Finish** — write everything to NVS (into the selected slot), drop the SoftAP, switch fully to station mode, start the normal poll loop.
- "Setup complete! This gateway is now live. To reconfigure or add another device later, visit `http://<station-ip>/` on this network."

### Advanced mode stays available

The existing multi-slot raw-fields page (already built) remains reachable at the station IP after setup — for adding slots without repeating the wizard, tweaking poll interval, clearing a slot's dedupe timestamp, and the existing action buttons (Poll Now / Reconnect WiFi / Reboot / Factory Reset). The wizard is the first-run experience; this page is for support/maintenance.

---

## Auto-Discovery of the U5 Device on the LAN

Goal: under ~15 seconds, not 60–90. Two phases.

### Phase 1 — Fast port-80 sweep

After joining WiFi, compute the local subnet from `WiFi.localIP()` + `WiFi.subnetMask()` (typically a /24 → 254 candidate hosts). Skip `.0`, `.255`, the device's own IP, and the gateway IP (usually `.1`).

Attempt a raw TCP connect to port 80 on each candidate, short timeout (150–250ms). **Do this concurrently, not serially** — 254 hosts × 200ms serial is 50+ seconds, too slow for a wizard step:
- **Simple approach**: batch several `WiFiClient` instances at once (ESP32 supports multiple concurrent sockets) — e.g. 10–16 per batch, wait for the batch, move on. ~250 hosts / 12 per batch ≈ 21 batches × ~250ms ≈ 5–6s.
- **Better approach, if already comfortable with it**: `AsyncTCP` to fire near-simultaneous connection attempts and collect results via callbacks — can bring this under 2s. Use this if the existing config-UI web server is already `ESPAsyncWebServer`-based; otherwise the simple batched approach is perfectly adequate.

### Phase 2 — Verify candidates

For each host with port 80 open (typically a handful, not hundreds), `POST /getDeviceVersion` with `{"password":"123456"}`, 1–2s timeout. Confirmed U5 if the response has `result: 0` and a non-empty `data.sn`. Collect `{ip, sn, deviceName, firmwareVersion}` for display.

If the default password fails on a candidate, don't silently drop it — list it as "found, needs password" and let the installer supply a different one for just that IP (Screen 4 already handles per-device password entry).

---

## OTA Firmware Updates

### Versioning

Firmware embeds a semantic version: `#define FIRMWARE_VERSION "1.0.0"`. Compare versions numerically (major.minor.patch as three integers), never as plain strings — `"1.10.0" > "1.9.0"` is false under string comparison.

### Checking for updates

```
GET https://community.iotsoft.in/api/devices/firmware/u5-gateway/latest
```
(Built, live.) Response: `{"success": true, "data": {"version": "1.1.0", "url": "https://community.iotsoft.in/firmware/u5-gateway/1.1.0.bin", "sha256": "...", "releaseNotes": "..."}}`. 404 if nothing has been released yet for this model — treat as "no update available," not an error.

Check on boot, once every 24h thereafter, and via a manual **Check for Updates** button in the advanced UI. An **Auto-update** toggle (default ON) in advanced settings lets a site freeze on a known-good version.

### Applying an update — HTTPS required

Unlike telemetry, **this must be HTTPS** — fetching and executing arbitrary code over an unauthenticated plain-HTTP channel is a real attack surface (anyone on the network path could push malicious firmware). Use `WiFiClientSecure`. At minimum `.setInsecure()` gets HTTPS working without embedding a CA certificate; the more correct choice for "runs 10 years, professional grade" is embedding Let's Encrypt's ISRG Root X1 root cert and doing proper certificate validation — worth the extra effort given this is the one place code execution is at stake.

Download to the inactive OTA partition (native ESP32 dual-partition behavior via `Update.h`). **Verify the SHA256 of the downloaded bytes against the `sha256` field before calling `Update.end()`** — this means using `Update.begin()/write()/end()` directly rather than the one-line `httpUpdate.update()` helper, specifically so the checksum check can gate the final commit. Abort and log if it doesn't match; never boot into unverified code.

### Rollback safety — the most important reliability feature here

Enable `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y`. A freshly-flashed OTA partition boots in a "pending verify" state; new firmware must explicitly call `esp_ota_mark_app_valid_cancel_rollback()` **after** confirming it's actually healthy (reconnected to WiFi and completed at least one successful heartbeat call to Jenix). If that confirmation doesn't happen — crash loop, bad build, whatever — the bootloader automatically reverts to the previous known-good partition with zero manual intervention. **A bad OTA update must never be able to permanently brick a field-deployed unit.**

### Publishing a release (your process, not firmware code)

1. Build the `.bin`.
2. Upload it to the VPS: `pscp firmware.bin root@154.61.69.200:/var/www/community/firmware/u5-gateway/1.1.0.bin` (served automatically — no nginx changes needed, it's already inside the static frontend root).
3. Register the metadata (authenticated, `JENIX_SUPER_ADMIN` only):
   ```
   POST https://community.iotsoft.in/api/devices/firmware
   Body: { "deviceModel": "u5-gateway", "version": "1.1.0", "url": "https://community.iotsoft.in/firmware/u5-gateway/1.1.0.bin", "sha256": "<sha256sum of the .bin>", "releaseNotes": "..." }
   ```
4. Recommend a staged rollout — validate on one gateway before letting the rest auto-update.

---

## Firmware Versioning & Remote Health Reporting

On a slower cadence than the attendance poll (every ~10 minutes is plenty — no need to add traffic to the 15–30s loop):

```
POST https://community.iotsoft.in/api/devices/heartbeat/<apiKey>
Body: { "firmwareVersion": "1.1.0", "ipAddress": "192.168.1.105",
        "freeHeap": 180000, "wifiRssi": -62, "uptimeSeconds": 86400, "resetReason": "POWERON_RESET" }
```
(Built, live — stores these on the `Device` record.) `resetReason` comes from `esp_reset_reason()`; map the enum to a readable string (`POWERON_RESET`, `SW_RESET`, `PANIC_RESET`, `TASK_WDT_RESET`, `BROWNOUT_RESET`, etc.) and log it on every boot for your own field debugging too, not just Jenix's benefit.

This is what makes a years-unattended device diagnosable without a site visit: is it online, what version, is memory slowly leaking (a declining free-heap trend over months is a real signal), is WiFi signal marginal, and why did it last reboot. **Note: the Jenix Devices page doesn't display these fields in the UI yet** — the data pipe exists and is stored, but no one's built the "show device health" view on top of it yet. Flagging honestly so it's not assumed to already be visible somewhere.

---

## Field Reliability Engineering (10-year unattended target)

- **Watchdog, two layers**: a hardware/task watchdog (`esp_task_wdt_init`/`esp_task_wdt_add` on the main loop) so a hang forces a reboot; and a "logic watchdog" — if the device and Jenix are *both* unreachable for an extended period (e.g. 1 hour of continuous poll failure), do a full `ESP.restart()` rather than retrying forever, since a full reboot sometimes clears a stuck WiFi/socket state a simple reconnect doesn't.
- **NVS write hygiene**: only write to `Preferences` when a value actually changes (compare before write). Flash write cycles are finite (~100k/sector); normal usage here is nowhere near that limit, but it's free correctness.
- **Crash diagnostics**: log `esp_reset_reason()` on every boot. Optionally enable `CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH` for post-mortem analysis on returned units — worth having, not required for v1.
- **Config backup/restore**: **Export Settings** (downloads current `Preferences` as JSON) and **Import Settings** (upload JSON, writes back) in the advanced UI — makes cloning a config to a second unit, or recovering after a factory reset, trivial instead of re-typing everything.
- **Physical factory-reset fallback**: holding the board's BOOT button for ~10 seconds triggers the same factory-reset logic as the web UI button. A hardware escape hatch for when WiFi/web UI is unreachable in the field (e.g. someone changed the WiFi password).
- **Status LED convention** (built-in board LED is fine): solid = healthy/connected, slow blink = connecting/searching, fast blink = error state, off = crashed-but-alive-on-watchdog. Lets an untrained on-site person tell "is this working" at a glance, no laptop needed.

---

## Memory budget (why this is comfortable on ESP32-S3)

- Filtered parse of `getWorkNoteList`: proportional only to kept fields — even 50+ backlogged records is a few KB, not hundreds of KB.
- Outbound push JSON: same small field set, trivial.
- Regular telemetry stays plain HTTP (no TLS stack overhead); only the rare OTA check/download pays the mbedTLS cost.
- No photo ever touches heap during regular polling.

This fits comfortably within ESP32-S3's ~512KB SRAM without needing PSRAM.

---

## Config the firmware needs (per slot, via `Preferences`)

The existing shipped firmware already supports this shape (6 slots) — the wizard above writes into it, it doesn't replace it.

| Key (per slot) | Value |
|---|---|
| Enabled | on/off |
| Label | e.g. "main-gate-u5" |
| `u5_ip` | discovered or manually entered |
| `u5_password` | verified via `/deviceLogin` during setup |
| `poll_interval_ms` | default 15000 |
| `push_base_url` | `http://community.iotsoft.in/api/devices/push` |
| `api_key` | verified via `/verify` during setup |
| `last_checkin_unix` | runtime dedupe state |

Global (not per-slot): WiFi SSID/password, `firmware_auto_update` (bool, default true).

---

## Validation checklist for your developer

1. Confirm the board can reach `http://192.168.1.92/getWorkNoteList` and get a 200 (test with a minimal sketch before adding filtering).
2. Confirm the filtered parse produces the expected small `JsonDocument` — log `doc["data"].size()` and each kept field, confirm `pic_large` is absent, watch free heap (`ESP.getFreeHeap()`) before/after for no large spike.
3. Confirm a push returns `received` matching records sent — cross-check via the Jenix admin UI's "Push URL & Event Log" on the device card.
4. Trigger a real punch, confirm it shows up in Jenix within one poll cycle.
5. Power-cycle, confirm no duplicate records re-sent (NVS dedupe working) and no unnecessary NVS writes when nothing changed.
6. Leave running unattended overnight, confirm still polling (no WiFi-drop lockup), no duplicate/missed records.
7. On-demand photo: click "Fetch photo from device" in Jenix on a recent event, confirm the gateway picks up `photoRequest` on its next poll, fetches and relays just that photo, image appears in the UI within ~one poll interval. Confirm a *regular* poll immediately after still carries no `pic_large`.
8. **Setup wizard end-to-end**: factory-reset a unit, connect to its SoftAP on a phone, confirm the captive portal auto-opens (or manually browse to `192.168.4.1` as fallback), complete WiFi join → auto-discovery → U5 login verify → API key paste + Test Connection → save, confirm it lands in station mode and starts polling without touching the advanced page at all.
9. **Discovery timing**: confirm the LAN sweep completes in the ~10-15s target range, not 60+ seconds, on a typical /24 network.
10. **OTA**: register a test release, confirm a gateway on an older version detects it, downloads over HTTPS, verifies the SHA256, and boots into it. Then deliberately publish a broken build and confirm the bootloader auto-rolls-back to the previous version rather than bricking.
11. **Health reporting**: confirm `POST /heartbeat/<apiKey>` calls are landing (check the `Device` record's `lastFreeHeap`/`lastWifiRssi`/`lastResetReason` fields via the API or database) — no UI shows this yet, but the data should be there.
12. **Physical reset**: confirm the BOOT-button-hold factory reset works when the web UI is unreachable.
