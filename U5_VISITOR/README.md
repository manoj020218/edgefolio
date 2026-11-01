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

## Live test results — 2026-11-01 (U5 SN ZY20241227014, firmware V3.0-20240912)

**Verdict: auto-enroll works end to end.** Stranger snapshot → `/insertEmployee` → `code 200` →
same person walks up again → green box "TempProbe" on screen + a type-2 record
(`userid 770722359`, `ispass 1`). Test person deleted afterwards.

| Finding | Detail |
|---|---|
| Record types | `type 2` = recognised (`ispass 1`). Any other type (1, 3–6) = strangers. |
| Stranger record | `userid "-1"`, `name "陌生人"` ("stranger"), `ispass 0`, 352×640 full-frame JPEG in `pic_large` (~37 KB). |
| No visitor number | Every stranger is `userid -1`. The U5 cannot tell that two stranger visits were the same person, so we must enroll. |
| **Paging (bug in all existing pollers)** | `getWorkNoteList` / `getEmployeeList` return 8 rows per page by default. Request `index` (starts at 1) and `count` (e.g. 50). Response has `total`, `page_sum`. Community `u5Poller.ts`, the ESP32 gateway and EdgeFolio `u5Adapter.js` read only page 1, so they lose punches if >8 happen between polls. |
| Burst records | One approach makes 1–4 stranger records 2–5 s apart. Group them into one sighting. A stranger record can also appear ~3 s *before* a successful match (first frame at an angle). |
| Background faces | People several metres away get logged as strangers. Auto-enroll needs a face-size/quality gate (or a "second sighting" rule). |
| Clock | Device was +2:30 ahead of IST (set to UTC+8). Attendance times are wrong until fixed. |
| Enroll result | `insertEmployee` with the stranger frame (as `data:image/jpeg;base64,…`) returns `code 200`. The device stores its own ~11 KB crop. `pass_date`/`pass_time` = `"0"` means no expiry; the expiry format is still untested. |

## Demo: temporary-labour attendance with no enrollment (`u5-visitor-auto-enroll.js`)

Hardware: the U5 as a **dedicated Visitor Attendance Machine** + the EdgeFolio PC on the same LAN.
No ESP32, no cloud. Regular staff use their own machine, so nothing mixes.

Setup (once):
1. Stop the Community `u5Poller.ts` and the ESP32-S3 gateway (the U5 serves one caller at a time).
2. Run EDGE from source (the paging fix in `u5Adapter.js` is not in the installed build yet).
3. EdgeFolio → Settings → Machines → add the U5, HTTP mode, `192.168.1.92`, name it "Visitor Machine".
4. Aim the U5 at the walk-up spot with nobody sitting behind it.
5. `node u5-visitor-auto-enroll.js reset` (clean start), then `node u5-visitor-auto-enroll.js run`.

Demo flow:
1. A new labourer walks up → machine shows stranger → script prints `ENROLLED V0001`.
2. They walk up again → green box "Temp V0001" = present.
3. Within ~30 s EdgeFolio's U5 poll shows a punch for machine ID `V0001` (unlinked) → HR links it
   to a new "Temp Labour" employee → attendance flows into payroll like anyone else.

`node u5-visitor-auto-enroll.js list` shows visitors + photos (`visitor-state/`, git-ignored).
