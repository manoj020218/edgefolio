# U5 Visitor Auto-ID — live machine test

Goal: let unknown (not enrolled) temporary workers be auto-assigned a visitor ID by the U5 face
terminal, and get attendance on later visits with no enrollment flow.

Owner's observation (not yet verified via API): when an unknown person comes close, the machine
speaks, takes a photo, writes it to the log as "unknown visitor" and numbers each visitor.

## Test steps (PC on the same LAN as the U5, default 192.168.1.92 / password 123456)

1. **Stop anything else polling the U5** (Community `u5Poller.ts`, the ESP32-S3 gateway, EDGE U5 sync).
   The U5's HTTP server is single-threaded; parallel callers hang it.
2. `node u5-visitor-probe.js scan` — baseline: device info, enrolled list, record types 0–6.
3. `node u5-visitor-probe.js watch --types 1,2,3,4` — leave running, then:
   - an **enrolled** person walks up → note which type the row appears in;
   - a **NOT enrolled** person walks up → note which type, and which field holds the visitor number;
   - the **same** unknown person walks up again → same visitor number, or a new one?
     (This decides whether the U5 itself re-identifies strangers or we must enroll them.)
4. `node u5-visitor-probe.js endpoints` — tries guessed stranger/visitor endpoints (read-only).
5. If unknown rows carry a photo: `node u5-visitor-probe.js enroll-test --photo probe-output/<run>/<file>.jpg`
   → walk up again, confirm it is now recognised → re-run with `--cleanup`.
   This is the only command that writes to the device.
6. Also check the U5 web UI (`http://192.168.1.92/index.html`) for stranger/visitor settings and screenshot them.

Output: `probe-output/<timestamp>-<cmd>/` (git-ignored — contains photos of real people).
Bring back `summary.json`, `new-rows.jsonl` and the `log.txt` files.

## Decision after the test
- **U5 re-identifies the same stranger with a stable visitor number** → no enrollment at all; just
  map the visitor number to a temp worker in `machine_import_staging` / `machine_id_mappings`.
- **Each sighting gets a new number** → auto-enroll: stranger photo → `/insertEmployee` with
  id `V0001…` and a validity window; `code:12` = already enrolled (dedupe).
- **No photo / no stranger record over the API** → manual enroll from the machine, or ESP32-S3 camera.

## reference-from-community/
Copied 2026-10-31 from `D:\IOT Device\Society\Jenix Community One` (source of truth stays there):
U5 handoff doc, ESP32-S3 gateway firmware plan + firmware source (no `.pio` build output), the
TypeScript U5 adapter and poller. EdgeFolio's own U5 adapter is `EDGE/backend/hardware/u5/u5Adapter.js`.
