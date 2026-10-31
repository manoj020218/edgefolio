# U5 Face Recognition Terminal — Integration Handoff

## Purpose of this document

This is the accumulated result of a full hands-on debugging session against a **real physical U5 device**, cross-referenced against two sibling projects (`Gym Access Control`, `EdgeFolio`) and the vendor's own documentation. It exists so the next person (human or AI) does not have to re-derive any of this from scratch — most of it took hours of live testing to establish, not guesswork.

**If you're about to research "how does the U5 push/report attendance," read this whole document first.** The short answer is: it doesn't push. Skip straight to [The Working Solution](#the-working-solution).

---

## Device identity (this exact unit)

| Field | Value |
|---|---|
| Model / label | "Face recognition access control" |
| Serial number (SN) | `ZY20241227014` |
| MAC | `c8:fe:f36:9c:30` |
| Firmware version | `V3.0-20240912` |
| Algorithm version | `v1.0` |
| LAN IP (DHCP) | `192.168.1.92` |
| Web admin UI | `http://192.168.1.92/index.html` — login `admin` / `123456` |
| Local HTTP API password | `123456` (same as web login; this is also the library default) |

This same physical unit was previously used for the `Gym Access Control` project (its old config still points at `smartgym.iotsoft.in`, a separate, unrelated deployment on the same VPS — see [Adjacent live system](#adjacent-live-system-dont-touch-by-accident)).

---

## The core finding: "Third-party record push" does not work on this firmware

The device's web UI (Network → server address) has a **"Third-party record push"** toggle + **"Push address"** free-text field, which looks exactly like what you'd want: configure a URL, the device POSTs attendance events to it as they happen. **Do not trust this feature on firmware `V3.0-20240912`.**

We proved it doesn't work, exhaustively, in this order:

1. Configured `Push address` = `https://community.iotsoft.in/api/devices/push/<apiKey>`, toggled Open, saved. **Zero requests** reached the server (checked via `grep 'devices/push' /var/log/nginx/access.log` on the VPS — literally nothing, not even a failed/rejected attempt).
2. Root-caused that to TLS: the device's push client only ever emits `http://` example URLs everywhere in its UI and docs — evidence it doesn't support HTTPS. Added a plain-HTTP carve-out in Nginx for exactly this path (see [Nginx change](#nginx-change-made-still-in-place)), confirmed the plain-HTTP endpoint works via manual `curl` (`HTTP 200`).
3. Corrected `Push address` to `http://community.iotsoft.in/api/devices/push/<apiKey>` (the original value was `https://`, copy-pasted from the app's own URL which is HTTPS-only), saved, confirmed the setting **persisted correctly** (checked by navigating away and back).
4. Still zero requests, even with a real, freshly-triggered punch afterward.
5. Rebooted the device (System → Command issuance → Restart) on the theory that the push target is only read at boot. Waited for it to fully come back online (confirmed via System Information reload). Confirmed the push settings **survived the reboot** unchanged. Punched again (multiple times). **Still zero requests.**
6. Captured **every single POST request** the device made for a continuous 40-second window (not filtered to any specific path — this would have caught a request to a wrong/undocumented path too, including 404s). Result: it only ever calls the same 6 polling endpoints (see next section), on a ~5–30s loop, forever. No attendance-related request of any kind.

**Conclusion: don't spend time on "third-party push" again on this firmware.** If a newer firmware version ever gets flashed, it's worth re-testing, but as shipped, this toggle is decorative.

---

## What IS live and working: the ZKBio Cloud polling protocol

Separately from the (non-functional) push feature, this device has a **primary polling connection** (Network → server address → `server address` field + `Poll time(s)`), currently still pointed at the old Gym project's server (`http://smartgym.iotsoft.in`). This connection is **actively working right now** — verified via live PM2 logs on the VPS.

The device polls these 6 endpoints on a loop (`Poll time(s)` interval, currently set to `5`, min 5s):

| Endpoint | Purpose |
|---|---|
| `POST /device/updateStateDevice` | Heartbeat |
| `POST /parameter/inertParameter` | Device pushes its own config JSON |
| `POST /parameter/selectParameterInfo` | Device polls for pending config changes |
| `POST /devicePass/selectDeleteInfo` | Device polls for faces to delete |
| `POST /device/selectRestart` | Device polls for a pending restart command |
| `POST /devicePass/selectPassInfo` | Device polls for employees/faces to enroll (sync) |

Reference server-side implementation (Fastify): `D:\IOT Device\Gym Access Control\apps\api-server\src\routes\zkbio-cloud.ts`, currently deployed live on the VPS as PM2 process **`edge-gym-api`** (id 9), serving `smartgym.iotsoft.in`.

**Important: this protocol never carries attendance data either.** We watched it live for well over a minute of continuous real traffic and it never once included a punch/checkin event — it's purely heartbeat + config + enrollment sync. Repointing this at our own server (an idea considered and explicitly rejected during this session) would require real new code and nginx routes, with no evidence it would actually deliver attendance data. **Don't go down that path without new evidence.**

---

## The working solution

The device also exposes its **own local HTTP API** — i.e., it acts as a server, and *we* call it directly (a pull model, not push). This is the one thing in this whole investigation that is genuinely documented, version-matched, and now live-verified against real hardware.

### Reference implementation

`D:\IOT Device\Salary_On\smart_salary\EdgeFolio\EDGE\backend\hardware\u5\u5Adapter.js` — its own header comment states: **"Confirmed against firmware V3.0-20240912"** — an exact match to this device. Treat this file as authoritative for the device's local API.

### Device local API reference

Base URL: `http://<device-ip>` (port 80). All calls are `POST` with `Content-Type: application/json`. Response shape: `{"result": 0, "message": "...", "data": ...}` (`result: 0` = success), **except** `/insertEmployee` which returns `{"code": 200}` on success.

⚠️ **The device's HTTP stack is single-threaded — call endpoints serially, never concurrently, or requests will hang/lock.**

| Endpoint | Body | Purpose |
|---|---|---|
| `POST /getDeviceVersion` | `{password}` | Returns `sn`, `device_name`, `firmware_version`, `face_recg_alg_version`, `mac` |
| `POST /deviceLogin` | `{username, password}` | Verifies credentials |
| `POST /serverSetting` | `{password, set:0}` to read / `{password, set:1, ...fields}` to write | Reads/writes the same Network → server address settings visible in the web UI |
| `POST /insertEmployee` | `{password, name, id_number, access_card_number, pass_date, pass_time, pic_large}` | Enrolls a face. `code:200` = success, `code:12` = face too similar/duplicate |
| `POST /getEmployeeList` | `{password}` | Lists enrolled people: `{userid, name, id_number, pic_large}` |
| `POST /deleteEmployee` | `{password, userid:[...]}` | Deletes an enrolled person |
| **`POST /getWorkNoteList`** | **`{password, type:2}`** | **← THE ATTENDANCE ENDPOINT.** Returns `{data: [{userid, checkin_time, ispass, id_number, name, temp, pic_large}, ...]}` |
| `POST /openDoor` | `{password}` | Triggers the door relay |

`checkin_time` is a `"YYYY-MM-DD HH:MM:SS"` string. `pic_large` is a large base64 JPEG (hundreds of KB) — EdgeFolio's adapter deliberately strips it before use to avoid overloading the device's single-connection server; **our poller currently does not strip it**, see [Known gaps](#known-gaps--next-steps).

### What we built: `backend/scripts/u5Poller.ts`

A standalone script (no dependency on the rest of the backend) that:
1. Calls `POST http://<device-ip>/getWorkNoteList` on an interval.
2. Filters to records newer than the last-seen timestamp (persisted to a local JSON file, so restarts don't re-send old records).
3. Forwards new records as-is to the **already-deployed** `POST /api/devices/push/:apiKey` endpoint (built earlier in this same session — see [Existing push pipeline](#existing-push-pipeline-built--deployed-earlier-this-session)), which runs them through the `u5Adapter` parser and stores them in `DeviceEventLog`.

**Must run on a machine on the same LAN as the device** — `192.168.1.92` is a private IP; the cloud VPS cannot reach it. A laptop/PC on the same network, left running, is the only viable host today.

Usage (PowerShell):
```powershell
cd backend
$env:U5_IP="192.168.1.92"
$env:U5_PASSWORD="123456"
$env:PUSH_URL="https://community.iotsoft.in/api/devices/push/c59ada87b12b48338aa4aae008ae0f9b"
npx ts-node scripts/u5Poller.ts
```

Env vars: `U5_IP` (required), `PUSH_URL` (required, includes the device's real `apiKey`), `U5_PASSWORD` (default `123456`), `POLL_MS` (default `15000`), `STATE_FILE` (default `./u5-poller-state.json`).

**Verified working end-to-end**: first run pulled 8 real historical punches, all correctly parsed (right name, right timestamp) and pushed; subsequent polls correctly reported "0 new" (dedupe working).

---

## Existing push pipeline (built + deployed earlier this session)

This was built *before* we discovered third-party push doesn't work, on the (reasonable, later-disproven) assumption the device would push to it directly. It's still exactly what the poller script forwards records to, so it's fully load-bearing — just fed by a different source than originally planned.

- `backend/src/modules/device/adapters/deviceAdapter.types.ts` — generic `DeviceAdapter` interface (brand-agnostic on purpose)
- `backend/src/modules/device/adapters/u5.adapter.ts` — U5 parser. Handles two shapes: the vendor's documented MQTT envelope (`{type:"note", data:{...}}`) AND a flat-field fallback (`{userid, checkin_time, ispass, ...}`) — **the flat shape is what `/getWorkNoteList` rows actually match**, confirmed live.
- `backend/src/modules/device/adapters/registry.ts` — `Device.make` → adapter dispatch. Add a new brand here by adding one file + one registry line.
- `backend/src/modules/device/deviceEventLog.model.ts` — stores every push, raw + parsed, so nothing is ever silently lost even if a future device's field names don't match.
- `Device` model additions: `make` (default `GENERIC`), `deviceTimezoneOffsetMinutes` (default `480` = UTC+8, since U5 units default their clock to China Standard Time regardless of install location).
- `POST /api/devices/push/:apiKey` — public endpoint, auth is purely the `apiKey` in the URL path (not a header), because device/script HTTP clients in this space often can't set custom headers.
- `GET /api/devices/:id/event-logs` — authenticated, lets you see recent pushes (raw + parsed side by side) from the Jenix UI.
- Frontend: `DevicePage.tsx` (Make field on device creation, "Push URL & Event Log" button per device card) + `DeviceEventLogModal.tsx` (shows the push URL to copy, live-polls recent event logs every 5s).

### Registered device (production)

- Society: **Krishna Nagar** on `community.iotsoft.in`
- Device: "Main Gate U5", type `ACCESS_READER`, code `GATE-U5-1`, make `U5`
- Device `_id`: `6a7db2e43bde41dd65dbb232`
- `apiKey`: `c59ada87b12b48338aa4aae008ae0f9b`
- Push URL (for the poller, HTTPS — fine since the *poller* runs plain Node, not the device itself): `https://community.iotsoft.in/api/devices/push/c59ada87b12b48338aa4aae008ae0f9b`

---

## Nginx change made (still in place)

`/etc/nginx/sites-enabled/community` on the VPS — the port-80 server block for `community.iotsoft.in` normally 301-redirects everything to HTTPS. Added one exception:

```nginx
location /api/devices/push/ {
    proxy_pass         http://community_api/api/devices/push/;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
}
```
placed before the catch-all `location / { return 301 https://$host$request_uri; }`. This turned out not to be sufficient on its own (see the push post-mortem above) but is harmless, narrowly scoped, and worth keeping — it's what let us confirm the endpoint works over plain HTTP at all, and would matter again for any future device whose firmware genuinely does support push but not TLS.

---

## Adjacent live system — don't touch by accident

The same VPS runs a **separate, unrelated project** that this exact device is also still connected to:

- `smartgym.iotsoft.in` → PM2 process **`edge-gym-api`** (id 9) → `/root/projects/smart_access/Gym/apps/api-server/dist/index.js`
- This is the *original* Gym Access Control deployment. The device's `server address` field still points here and is actively polling it. **This is expected and harmless** — it's just heartbeat/config/enrollment sync, not attendance data, and doesn't conflict with anything we built for Jenix.
- Don't restart/stop `edge-gym-api` without checking if it's still needed for the Gym project independently of this investigation.
- Nginx's default access log (`/var/log/nginx/access.log`) is **shared across every site on the VPS**, including this one — when grepping it, remember hits aren't pre-filtered by vhost.

---

## Other reference material (already investigated, don't re-research)

- `D:\IOT Device\Salary_On\U5_Zhongshen\` — screenshots of the device's Server settings screen, plus the vendor's own protocol docs:
  - `Open Api V20241001-1(2).docx` — the vendor's **cloud-mediated** gateway API (agentNo/RSA-signed requests to `mqtt.openapi.eelpw.com`). Not usable by us directly (we don't have vendor agent credentials, and our device isn't registered with their cloud). Its "2.17 Upload the door-opening records" section is genuinely incomplete in the source doc — don't go looking for a missing example, it was never written.
  - `Face recognition 3.0API-MQTT-V1.2...docx` — the authoritative **MQTT** protocol spec (not HTTP). Confirms the `{type:"note", data:{employeeId, employeeName, noteTime, noteWay, notePass, notePity, ...}}` envelope our adapter's primary parse path expects. `noteWay`: 0 = face (only value the spec formally documents; other values 1–6 are carried over from a separate real-traffic capture in the Gym project, not from this spec).
- `D:\IOT Device\Gym Access Control\` — has a real `BaseReader`/`createReader` adapter pattern (`apps/hardware-adapter/src/readers/`) for *wired* readers (Wiegand/serial/TCP) — not applicable to this networked device, but a good pattern reference for a future wired-reader brand. Also has a tested time-window access rule engine (`packages/access-engine`) — hard allow/deny only, no escalating-restriction concept, would need extending for a curfew feature.
- `D:\IOT Device\Salary_On\smart_salary\EdgeFolio\` — has independently-built (siloed, no shared abstraction) integrations for U5, ZKTeco, and other brands. `hardware/u5/u5Adapter.js` is the one file worth treating as authoritative (see above).

---

## Known gaps / next steps

- **Poller isn't a persistent service yet** — it's running in a foreground terminal on a dev machine. Needs Windows Task Scheduler or `pm2` (or equivalent) to survive reboots/logouts for real use.
- **`pic_large` isn't stripped before forwarding** — the poller currently pushes the full base64 photo into `DeviceEventLog.rawBody` on every punch. Works, but bloats the collection; EdgeFolio's own adapter strips this deliberately for exactly this reason. Worth trimming before this runs unattended long-term.
- **No identity mapping yet** — `deviceExternalUserId` (e.g. `2120152124`) is stored as-is, not linked to a Jenix `Resident`/`Student` record.
- **No direction (entry/exit) or `Gate` linkage** — `Gate.entryType` (`ENTRY`/`EXIT`/`BOTH`/`SERVICE`) already models the "two devices, one per direction" case from the original ask, but nothing wires a push event to a specific gate/direction yet.
- **No parent notification or curfew/time-window logic** — the two actual product objectives from the original request. Everything above this line is the "does the hardware even talk to us" foundation; these are the next real feature layer, unbuilt.
- **Device Type dropdown bug (unrelated, but discovered + fixed this session)**: `DevicePage.tsx`'s `<option>` elements previously had no explicit `value`, so the browser submitted display text ("ACCESS READER") instead of the backend's enum value ("ACCESS_READER") — every device creation 400'd. Fixed and deployed; mentioned here only so nobody "rediscovers" it.
