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
| **Paging (bug in all existing pollers)** | `getWorkNoteList` / `getEmployeeList` are paged: `index` starts at 1 and **always advances 8 rows, whatever `count` is**. A larger `count` returns more rows but the pages overlap, so always send `count: 8`. Response has `total`, `page_sum`, rows newest first. EdgeFolio `u5Adapter.js` is fixed (`cd7a353` + `d882d1a`). The Community `u5Poller.ts` and the ESP32 gateway still read page 1 only and lose punches if >8 happen between polls. |
| Burst records | One approach makes 1–4 stranger records 2–5 s apart. Group them into one sighting. A stranger record can also appear ~3 s *before* a successful match (first frame at an angle). |
| Background faces | People several metres away get logged as strangers. Auto-enroll needs a face-size/quality gate (or a "second sighting" rule). |
| Clock | Device runs on UTC+8 (+2:30 vs IST). EdgeFolio corrects it: Settings → U5 Machines → Timezone, device **UTC+8**, local UTC+5:30. Device-clock times only matter to scripts that compare device timestamps with each other. |
| Enroll result | `insertEmployee` with the stranger frame (as `data:image/jpeg;base64,…`) returns `code 200`. The device stores its own ~11 KB crop. `pass_date`/`pass_time` = `"0"` means no expiry; the expiry format is still untested. |

## Demo: temporary-labour attendance with no enrollment (`u5-visitor-auto-enroll.js`)

Hardware: the U5 as a **dedicated Visitor Attendance Machine** + the EdgeFolio PC on the same LAN.
No ESP32, no cloud. Regular staff use their own machine, so nothing mixes.

**Rehearsed end to end on 2026-11-01:** unknown face → `V0001` enrolled within ~10 s → green box on
the next visit → punch staged in EdgeFolio in IST → linked to an employee → `present, check-in 11:47:33`.
Later visits arrived already linked; only a commit was needed.

### Setup (once)
1. Stop the Community `u5Poller.ts` and the ESP32-S3 gateway. The U5 serves one caller at a time.
   The U5's "Record Upload Switch" is not needed (EdgeFolio pulls; push never worked on this firmware).
2. Run EDGE from source, because the U5 fixes are not in the installed build yet. In `EDGE/`:
   - UI + window: `npm run dev`. In dev mode Electron does **not** start the backend.
   - Backend: `ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron backend/index.js`
     (`npm run backend` fails: `better-sqlite3` is built for Electron's Node, not system Node;
     don't `npm rebuild` it, that breaks `build:exe`).
   - This uses the dev database `EDGE/storage/database/edgefolio.db`, not the installed app's data.
3. EdgeFolio → Settings → **U5 Machines** → Add Device: name "Visitor Machine", SN `ZY20241227014`,
   **Direct HTTP**, IP `192.168.1.92` (check it: a typo just shows "fetch failed" every 30 s), port 80,
   password `123456`. Timezone: device **UTC+8**, local UTC+5:30.
4. Aim the U5 at the walk-up spot with nobody sitting behind it.
5. `node u5-visitor-auto-enroll.js reset` (clean start), then `node u5-visitor-auto-enroll.js run`.

### Demo flow
1. A new labourer walks up → machine says stranger → script prints `ENROLLED V0001`.
2. They step away ~30 s and walk up again → green box "Temp V0001" = present.
3. Within ~30 s: Attendance → Import → **Machine Import** shows the punch under the U5's own user
   number (e.g. `1394080831`) with name **Temp V0001**, time in IST.
4. Employees → Add "Temp Labour 1" (name, department, salary are required).
   Or use "Create Employees & Map Remaining" in Machine Import to create it from the machine name.
5. Machine Import **Step 1**: pick the employee for that machine ID. **Step 2**: click
   **"Save 1 Mapping & Commit"** (saves the link and commits in one click).
6. Attendance (today) → Temp Labour 1 is **present**. Every later visit is staged already linked;
   just commit.

`node u5-visitor-auto-enroll.js list` shows visitors + photos (`visitor-state/`, git-ignored).

### Resetting between rehearsals
- `node u5-visitor-auto-enroll.js reset` removes only `V####` people from the U5 and clears local state.
- Machine Import → delete the day's `U5-HTTP-<SN>-<date>` batch (only removes staged rows, not
  committed attendance).
- To make EDGE re-read the whole machine log, delete and re-add the device (clears its watermark).
- Careful: "delete all records" in the U5's own menu wiped the log **and every enrolled face**.

### Known gaps (for the production version)
- Machine Import shows the U5 user number, not `V0001`: log rows carry no `id_number`. Fix by mapping
  `userid` → `id_number` via `getEmployeeList` in EDGE.
- No face-size / quality check before enrolling, so background faces can get IDs. No expiry yet
  (`pass_date`/`pass_time` format untested).
- The script and EDGE share the single-threaded U5. An occasional simultaneous request times out and
  is retried on the next cycle; harmless.
- Auto-enroll should move into EDGE itself (visitor screen with photos, auto-created temp employee,
  expiry), replacing this standalone script.
