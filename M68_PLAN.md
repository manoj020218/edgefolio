# M68 (WitEasy / FK BS-protocol) Machine Integration — Implementation Plan

> **Goal:** Add the WitEasy M68 face/attendance machine (office unit: `192.168.1.130`, port `5005`)
> as a new machine type `m68` in EDGEFOLIO, alongside the existing U5 (MQTT/HTTP-poll), ZKTeco
> (network pull) and Jenix (USB file) integrations.
>
> **Protocol source (reverse-engineered from the vendor SDK, verified in code):**
> `D:\IOT Device\Salary_On\M68 witeasy\20241218 BS_ASP.NET_C#_SDK_DEMO`
> — `1_Source code_Asp.Net_v2\Fkwebserver_v2\Default.aspx.cs` (device endpoint dispatch),
> `App_Code\FKWebTrans.cs` (command queue + framing), `ControlFK_v2\App_Code\FKDataHS100.cs`
> (binary record structs). PDF `4. BS_FKSDK_comm_protocol new.pdf` is the official reference.
>
> Date: 2026-07-12. Execution model: Sonnet agent codes per step, Fable reviews (see LICENSING_PLAN.md).

---

## 1. How the M68 BS protocol actually works (decided facts, from SDK source)

**Direction: the DEVICE is the HTTP client.** In "WAN / B-S communication mode" the machine is
configured with a **server IP + port + page path** and it POSTs to that single endpoint in a loop
(observed cadence in vendor log: every ~5–20 s). EDGEFOLIO must therefore **listen** on a port
reachable from the LAN. This is the opposite of our U5 HTTP-poll mode.

**Single endpoint, two content types:**
- `application/octet-stream` — metadata in HTTP headers: `dev_id`, `request_code`, `trans_id`,
  `blk_no`, `blk_len`; raw binary body.
- `application/json;charset=utf-8` — same fields in a JSON body, binary payload base64-encoded in
  `"block"`.
- Optional `encrypt` header: `yes` (AES) or `base64only`. **Phase A supports unencrypted + base64only;**
  AES deferred (needs the vendor key scheme from the PDF).

**`request_code` values the device sends:**
| request_code | Meaning | Our handling |
|---|---|---|
| `receive_cmd` | "Any command for me?" — poll | Pop next queued command for this dev_id, else empty OK |
| `send_cmd_result` | Result data for a queued command (may arrive in multiple blocks: `blk_no` > 0 accumulate, `blk_no = 0` final) | Reassemble blocks, parse per command type, mark command done |
| `realtime_glog` | **Real-time attendance punch push** | Parse GLog record(s) → staging → attendance |
| `realtime_enroll_data` | New enrollment made on the device | Store/flag for mapping (Phase C) |
| `realtime_barcode` | QR/barcode scan event | Log only (Phase A) |
| `realtime_operation` | Device operation/audit event | Log only (Phase A) |

**Commands we can queue (server → device via `receive_cmd` response):** `SET_TIME`,
`GET_LOG_DATA` (bulk log pull), `GET_USER_ID_LIST`, `GET_USER_INFO`, `GET_ENROLL_DATA`,
`GET_DEVICE_STATUS`, `SET_USER_INFO`, `SET_ENROLL_DATA`, `UPDATE_FIRMWARE`. Command params are
JSON; large binaries are passed as `BIN_n` block references. Time format: 14-char `YYYYMMDDHHMMSS`.

**GLog attendance record — 12-byte binary struct (CIF11 layout):**
```
UserID     uint32  (bytes 0-3, little-endian)
DataVer    uint8   (byte 4)
InOut      uint8   (byte 5)   — in/out flag ("FlagResult")
VerifyMode uint8   (byte 6)   — face/fp/card/password
Second     uint8   (byte 7)
bitfield   uint32  (bytes 8-11, little-endian):
   Valid:2, Year:10 (real year − 1900), Month:4, Day:5, Hour:5, Minute:6
```
(There is an older CIF10 12-byte layout too — decode by `DataVer`; implement CIF11 first, the
demo treats it as current.)

**About `192.168.1.130:5005`:** that is the device's own address. Port 5005 is the FK devices'
local service port (used by the C/S-mode SDK). For B/S mode we don't connect to it — instead the
device's comm settings must be pointed AT the EDGEFOLIO PC. Step 0 probes this and documents the
device-side setup.

---

## 2. Architecture decision

- **Dedicated LAN listener, separate from the main API.** The main Express app binds
  `127.0.0.1:7001` (kept — that's a security feature). A new tiny HTTP listener binds
  `0.0.0.0:<EDGE_M68_PORT>` (default **5005**, configurable) and serves ONLY the FK endpoint.
  It shares the process (started like the U5 service from `index.js` / electron main), so no new
  deployment unit. Windows Firewall note goes in the device-setup doc.
- **No JWT from devices — device auth = registration allowlist** (audit DEV-01): only requests
  whose `dev_id` matches an enabled row in `m68_devices` are processed; unknown `dev_id`s are
  logged (visible in UI as "unregistered device seen") and answered with an error. First-time
  registration happens in the UI by typing the dev_id (shown on the machine's own screen/sticker).
- **Reuse the existing FK-safe import pipeline**: punches go into `machine_import_staging`
  (source `m68`), user-ID mapping via the existing `machine_id_mappings` + unmapped-review UI,
  then the existing commit path writes attendance. Real-time pushes auto-commit for already-mapped
  users; unmapped ones wait in staging for mapping (same UX as Jenix/alog imports).
- **License readonly mode:** device punches are still **staged** (never lose raw data) but
  auto-commit to attendance is suspended while `readonly` (consistent with the license design:
  no new payroll-relevant writes; staging preserves everything for after renewal).

---

## 3. Implementation steps

### STEP M68-0 — Probe & device-side setup ✅ DONE 2026-07-13 (photos in `D:\IOT Device\Salary_On\M68 witeasy\`)
Confirmed firmware menus:
- **Network → Ethernet:** DHCP No, IP `192.168.1.130` (static), Subnet, Gateway `192.168.1.1`,
  **Port No `5005`** — this is the device's OWN local port (C/S mode), not used by us.
- **Network → Server Set:** DNS No/Yes (Yes allows a web address instead of IP), **Server IP**,
  **SerPortNo** (default `80`, editable), **Server Req Yes/No**.
- **Network → Net Mode:** `Local` | `Internet`.
- **No path field** → the device POSTs to the root path of Server IP:SerPortNo (vendor demo runs
  FKWebServer as IIS site root). Our listener must accept `POST /` (and any path).
- No encryption menu found → assume unencrypted/base64only until real traffic says otherwise.

**Device settings for EDGEFOLIO (to be documented in docs/M68_DEVICE_SETUP.md):**
Net Mode = `Internet`; Server Set → DNS `No`, Server IP = EDGEFOLIO PC's LAN IP,
SerPortNo = `5005` (our listener EDGE_M68_PORT), Server Req = `Yes`.
(Device's own Ethernet Port No stays 5005 — unrelated.)

### STEP M68-1 — DB + parser + listener + real-time glog ingestion (core) ✅ DONE 2026-07-13
**Schema (config/database.js migration, pattern like u5_devices):**
- `m68_devices`: `id, dev_id UNIQUE, name, location, enabled INTEGER DEFAULT 1, encrypt_mode TEXT DEFAULT 'none',
  last_seen_at TEXT, last_request_code TEXT, fw_info TEXT, created_at, updated_at`
- `m68_commands`: `id, dev_id, trans_id UNIQUE, cmd_code, cmd_param TEXT, status TEXT
  ('pending'|'sent'|'done'|'error') , result_summary TEXT, created_at, sent_at, completed_at`
  (+ index dev_id+status)
- `m68_events`: raw non-glog events (enroll/barcode/operation) for audit — `id, dev_id, kind, payload_b64, received_at`

**New files (backend, CommonJS, match existing style):**
- `services/m68Protocol.js` — pure functions: parse request (headers vs JSON body), decode base64
  block, `parseGLogRecords(buffer)` (12-byte CIF11 structs → `{userId, at:ISO, inOut, verifyMode}`;
  validate Valid flag, plausible date), `buildCmdResponse(transId, cmdCode, cmdParamJson)`,
  `fkTime14(date)`. **100% unit-testable without a device.**
- `services/m68Service.js` — the listener (node http or a second express instance), request
  dispatch per request_code, dev_id allowlist, block reassembly buffer per dev_id (in-memory,
  like FKWebTrans.SaveTransBuff/GetTransBuff), command queue pop on `receive_cmd`, glog → staging
  (`machine_import_staging` with source 'm68', device user id as machine_user_id) + auto-commit for
  mapped users (respect license readonly rule), update `last_seen_at`. Crash-safe: every handler
  try/caught (STAB-01), one bad request never kills the process.
- Start/stop wiring in `backend/index.js` and `electron/main.js` alongside u5Service, gated by
  `settings` flag or presence of enabled m68_devices. Env: `EDGE_M68_PORT` (default 5005),
  `EDGE_M68_BIND` (default 0.0.0.0).

**Auto time-sync:** when a device's clock drifts (compare glog time vs server on each push is
unreliable — instead queue `SET_TIME` daily and on device registration; cheap and prevents the
CST/IST style issues we hit with U5).

### STEP M68-2 — API routes + frontend device management ✅ DONE 2026-07-13
- `routes/m68.js` (behind requireAuth + requireLicense, mounted in server.js like `/u5`):
  CRUD `/m68/devices`, `GET /m68/status` (per device: last_seen, pending cmds, staged/unmapped
  counts), `POST /m68/command` (queue SET_TIME / GET_LOG_DATA / GET_DEVICE_STATUS),
  `GET /m68/events`.
- Frontend Settings → Machines: add **M68 (WitEasy)** type next to the U5 form (commit 5c781d8
  added the HTTP-mode form — mirror that component): fields name, dev_id, location; status chip
  green if last_seen < 2 min; buttons "Sync Time", "Pull All Logs", "Device Status".
  Unmapped punches reuse the existing machine-import mapping UI (they appear there already via
  the staging pipeline — verify the source label shows 'm68').

### STEP M68-3 — Backfill + user sync (Phase C, after core proven on real device) ✅ DONE 2026-07-13
- `GET_LOG_DATA` bulk pull → multi-block `send_cmd_result` reassembly → same staging pipeline
  (dedupe: unique key dev_id+userId+timestamp, INSERT OR IGNORE — check how staging dedupes today).
- `GET_USER_ID_LIST` / `GET_USER_INFO` → show device-side users in mapping UI.
- Optional later: `SET_USER_INFO` push (create users on machine from EDGEFOLIO), `SET_ENROLL_DATA`
  (push face/fp templates), `realtime_enroll_data` capture. Firmware update: out of scope.

---

## 4. Verification plan
1. **Unit:** `scripts/m68-protocol-test.js` — golden 12-byte GLog buffers (hand-crafted:
   known user/date incl. edge cases year 2048 bitfield, month boundaries, Valid=0 rejects) through
   `parseGLogRecords`; JSON + binary request parsing; cmd response framing.
2. **Simulator:** `scripts/m68-device-sim.js` — node script that behaves like the machine:
   polls `receive_cmd`, executes SET_TIME/GET_LOG_DATA fake responses (multi-block!), pushes
   `realtime_glog`. Full E2E against the running backend WITHOUT hardware: register device in UI →
   sim pushes punch → punch appears in staging → mapping → attendance row.
3. **Hardware:** point the office M68 (192.168.1.130) at the dev PC, watch `m68_devices.last_seen_at`,
   make a real face punch, verify attendance. Test unregistered-dev_id rejection by temporarily
   changing dev_id row.
4. **Regression:** U5 + Jenix import paths untouched (run their existing flows once).

## 5. Risks / open items
- **Encryption default:** if the office unit insists on AES, Phase A needs the AES key derivation
  from the PDF (readable on a machine with a PDF tool) — resolve at STEP M68-0.
- **Older CIF10 record layout:** decode per DataVer byte; log-and-skip unknown versions.
- **Port 5005 conflict** with anything else on client PCs → make port editable in the UI, store in
  settings, restart listener on change.
- **Multiple devices:** design is multi-device from day one (allowlist keyed by dev_id).
- **Installer:** Windows Firewall inbound rule for the listener port must be added by the NSIS
  installer or the setup doc (note for the Electron packaging task).

---

# STEP M68-4 — VPS Device Cloud Relay (multi-location, multi-model)  📋 PLANNED 2026-07-13

> **The big picture the owner asked for:** machines in many cities, one centralized EDGEFOLIO
> running payroll for all of them. The VPS is a **relay + buffer ONLY** — it never runs payroll,
> never stores salaries or biometrics, just parks device punches until the right EDGEFOLIO pulls
> them. Offline-first is preserved: if the VPS is down, punches queue on the device (its own
> buffer) and EDGEFOLIO keeps running on whatever it already has.

## 4.1 Why a pure relay works here (the key insight)

Both ends are **outbound HTTP clients**, so NOTHING needs port-forwarding, static IPs, or LAN setup:
- The **machine** already dials out to a configured Server IP/DNS (confirmed on the M68: Server Set
  → DNS = Yes accepts a web address). Point it at `devicehub.iotsoft.in`.
- **EDGEFOLIO** already dials out (it does license heartbeats to iotsoft.in today). It adds a
  "pull my devices' punches" call to the same outbound sync.
- The VPS is the only public, always-on endpoint in the middle. It accepts pushes from machines and
  serves pulls to EDGEFOLIO. Neither the shop nor the payroll PC needs any inbound network config.

```
  Shop A ─ M68 ┐
  Shop B ─ U5  ┼──push──▶  devicehub.iotsoft.in (VPS relay)
  Shop C ─ ZKT ┘             │  edge_devices  (dev_id → tenantId, model, enabled)
                             │  edge_punches  (normalized, undelivered buffer)
                             │  edge_device_users, edge_commands (queue per device)
                             ▼
              central EDGEFOLIO ──pull (tenant token)──▶ drains punches
                             │  → machine_import_staging (source 'cloud:<model>')
                             │  → existing mapping + auto-commit → payroll (LOCAL)
```

## 4.2 Multi-model from day one — the adapter pattern (this is the core design decision)

Different machine models speak different protocols (M68 = FK BS binary; U5 = Zhongyan MQTT/HTTP;
ZKTeco = ADMS/iclock form-posts). We do NOT want one tangled endpoint. Instead:

- **Per-model ingest adapter** on the VPS: a small module that owns ONE model's wire protocol and
  does exactly one job — turn that model's raw push into a **NormalizedPunch**:
  `{ tenantId, model, devId, deviceUserId, at (UTC ISO), direction, verifyMode, raw }`.
  - `adapters/m68.js` — reuse the ALREADY-WRITTEN `m68Protocol.js` verbatim (it's pure, no DB/no
    Electron deps — lift it to the VPS as a shared package). Handles receive_cmd/glog/cmd_result.
  - `adapters/zhongyan-u5.js`, `adapters/zkteco-adms.js` — added later, same interface.
- **One normalized core** downstream of every adapter: dedupe, buffer in `edge_punches`, expose the
  same pull API regardless of model. EDGEFOLIO never learns the wire protocol — it just receives
  NormalizedPunches tagged with `model` and `devId`.
- **Adding a new machine model = one new adapter file + a route mount. Zero downstream changes.**
  (Mirrors the billing platform's "new product = one DB insert" principle in CLAUDE.md.)

**Adapter interface (lock this now so all models comply):**
```
module.exports = {
  model: 'm68',
  // Express handler mounted at /devicehub/:model/* — owns that model's endpoint(s)
  handleRequest(req, res, ctx),   // ctx = { resolveTenant(devId), buffer(punches[]),
                                  //         popCommand(devId), completeCommand(...), saveUsers(...) }
  // optional: how this model receives server→device commands (poll vs push)
}
```

## 4.3 VPS pieces (in billing-server or a sibling `devicehub` service)

Decide placement first: **new PM2 app `devicehub` on its own port**, nginx `devicehub.iotsoft.in`
→ that port, **plain HTTP path exposed** (many devices can't do HTTPS/TLS-redirects — see risks).
Keep it separate from `billing-platform` so device traffic can't affect billing. Mongo (reuse the
cluster) collections:
- `edge_devices`: `{ devId, model, tenantId (→ EdgeLicense.clientId), name, location, enabled,
  encryptMode, lastSeenAt, fwInfo }`. **dev_id → tenant mapping is the heart of the whole thing.**
- `edge_punches`: normalized buffer `{ tenantId, model, devId, deviceUserId, at, direction,
  verifyMode, raw, deliveredAt (null until pulled) }` + unique index
  `(tenantId, devId, deviceUserId, at)` for dedupe.
- `edge_device_users`, `edge_commands` — same roles as the local M68 tables, tenant-scoped.

**Public device endpoints** (no auth — device can't hold a token; security = dev_id allowlist +
optional per-model AES): `POST /devicehub/:model` (+ any sub-paths the model needs). Unknown dev_id
→ logged as "unclaimed device seen" (surfaces in admin so the client can claim it), punch parked
under a holding area, not dropped.

**Tenant (EDGEFOLIO) endpoints** (auth = the existing license/tenant token EDGEFOLIO already has):
- `POST /devicehub/register` `{ devId, model }` → binds dev_id to this tenant (idempotent; 409 if
  already claimed by another tenant → "contact support", same pattern as license machine-binding).
- `GET /devicehub/punches?since=<cursor>` → returns this tenant's undelivered NormalizedPunches,
  marks them delivered (or delete-on-ack). Cursor/ack so nothing is lost or double-counted.
- `POST /devicehub/command` `{ devId, cmdCode }` → queue SET_TIME / GET_LOG_DATA / etc. for remote
  machine management from the central EDGEFOLIO or the superadmin dashboard.
- `GET /devicehub/devices` → tenant's devices + last-seen + counts.

## 4.4 EDGEFOLIO (EDGE) changes

- **Cloud device mode** toggle per device (LAN-direct vs cloud-relay). Cloud devices are registered
  by typing dev_id in the M68 tab; EDGE calls `/devicehub/register` (reusing its outbound sync auth).
- **Pull job**: extend the existing sync/heartbeat scheduler to call `GET /devicehub/punches`, feed
  results into the SAME `machine_import_staging` pipeline with `source_type` = `cloud:m68` (etc.) →
  existing mapping + auto-commit. **Zero new payroll code** — punches look like any other import.
- License-aware: in `readonly` state, still pull + stage (never lose data), suspend auto-commit —
  identical rule to the local M68 path.
- The M68 tab shows cloud devices with a "☁ cloud" badge and last-seen from the relay.

## 4.5 Business alignment (why this is worth building)

- **Turns EDGEFOLIO into a multi-branch SaaS.** Head office runs payroll for machines in N cities.
- **Device count = a billable plan dimension** (like maxEmployees). dev_id is registered against an
  `EdgeLicense`, so the relay already knows the tenant and can enforce/report a device cap.
- **Remote fleet management** from the superadmin dashboard (sync time, pull logs, see last-seen for
  every machine of every client) — a support & upsell lever.
- Reuses everything already built: `m68Protocol.js` (pure, portable), the license/tenant identity,
  the billing dashboard shell, the staging/mapping pipeline.

## 4.6 Build order & verification
1. Lock the **adapter interface** + normalized punch schema (this doc).
2. VPS `devicehub` skeleton: `edge_devices`/`edge_punches`, register + punches (pull/ack) endpoints,
   tenant auth — tested with the existing `m68-device-sim.js` pointed at the VPS.
3. Lift `m68Protocol.js` into a shared package; `adapters/m68.js` wraps it; wire
   `POST /devicehub/m68`. Prove with the simulator over the internet (dedupe + ack correctness).
4. EDGE cloud-mode toggle + pull job → staging. E2E: sim (as "remote machine") → VPS → EDGE pulls →
   attendance row, with NO duplicates across repeated pulls.
5. nginx `devicehub.iotsoft.in` (+ plain-HTTP listener for devices), PM2 app, superadmin fleet view.
6. Real hardware: one M68 pointed at `devicehub.iotsoft.in` (DNS mode) → punch → central EDGEFOLIO.
7. Later adapters: `zhongyan-u5.js`, `zkteco-adms.js` — each is a new file + route, no core changes.

## 4.7 Risks / open items (M68-4)
- **Plain HTTP over WAN.** Devices generally can't do HTTPS. Payload is user-id + timestamp (no
  names/biometrics) so exposure is limited, but add the vendor `encrypt: yes` (AES) per-model where
  supported, and rate-limit + dev_id allowlist. Never accept payroll-identifying data at the relay.
- **dev_id spoofing.** dev_id is the only device identity in the FK protocol. Mitigate: claim-on-
  first-use binding (dev_id locks to first tenant that registers it), admin visibility of unclaimed
  devices, optional per-device shared secret/AES for models that support it.
- **Clock/timezone.** Normalize every punch to UTC at the adapter; EDGE converts to its configured
  tz on display/commit (we already hit CST→IST issues with U5 — centralize the fix here).
- **Delivery semantics.** Pull must be at-least-once with idempotent dedupe (unique index +
  ack cursor) so a dropped ack never double-counts attendance.
- **Buffer retention.** Auto-purge `edge_punches` delivered > N days; cap undelivered age with an
  alert so a long-offline EDGEFOLIO is visible to support.
- **Command direction per model.** M68/U5 poll for commands; some ZKTeco variants expect push —
  the adapter owns this difference; the tenant command API stays uniform.
