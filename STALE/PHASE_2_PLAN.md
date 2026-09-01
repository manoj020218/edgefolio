# EDGEFOLIO — Phase 2 Implementation Plan
**Decision Date:** April 27, 2026 | **Status:** Planning → Ready to Execute

---

## Architectural Decisions (Locked)

### Decision 1: Desktop Packaging → Electron
- **Chosen:** Electron v30 + electron-builder + electron-updater
- **Rejected:** Tauri (Rust backend = full rewrite), NSIS+Node (bad UX), browser-only (non-technical users can't run `npm start`)
- **Output:** `EDGEFOLIO-Setup-1.x.x.exe` — single installer, double-click to run, auto-update from GitHub Releases
- **Code-signing note:** Without cert → SmartScreen warning (acceptable for alpha). EV cert ~₹15,000/yr for production.

### Decision 2: Biometric Machine Integration → 3-Source Strategy
- **Source A:** ZKTeco USB `.dat`/`.att` file parser (covers ~80% of Indian factory machines)
- **Source B:** Excel import with column-mapper UI (covers remaining brands — ZKTime, eSSL eTIME5, Hikvision, Dahua)
- **Source C:** ZKTeco TCP live sync via LAN port 4370 — Phase 2C only (real-time punches)
- **All 3 sources normalize to the existing JSON attendance contract** (schema already defined in PRD)

### Decision 3: Machine Brand Coverage
| Brand | Format | Phase |
|---|---|---|
| ZKTeco (all models) | .dat USB + TCP port 4370 | 2A + 2C |
| eSSL (ZK distributor India) | .dat USB + Excel | 2A + 2B |
| Realtime, Anviz, Fingertec | .dat USB (ZK-compatible) | 2A |
| Hikvision | Excel (own columns) | 2B |
| Dahua | Excel (own columns) | 2B |
| Suprema | Excel only (own SDK — skip for now) | 2B |

---

## Phase 2 — Full Checklist

> Legend: `[ ]` = Pending · `[→]` = In Progress · `[x]` = Done · `[!]` = Blocked

---

### Phase 2A — Electron Shell + SQLite Backend
**Target:** Working `.exe` that opens the existing React UI as a desktop app

#### 2A-1: Electron Setup ✅ DONE — April 27, 2026
- [x] Add `EDGE/electron/` folder as the Electron main process
- [x] Install: `electron` v30.5.1, `electron-builder`, `electron-updater`, `concurrently`, `wait-on`, `cross-env`
- [x] Create `EDGE/electron/main.js` — BrowserWindow, IPC handlers (open/save dialog, open-path, version), single-instance lock, external link handling
- [x] Create `EDGE/electron/preload.js` — secure context bridge (file dialogs, auto-updater events, cleanup helpers)
- [x] Create `EDGE/electron/updater.js` — auto-update: checks on launch + every 4h, forwards progress events to renderer
- [x] Update `EDGE/frontend/vite.config.js` — `base: './'`, disable auto-open when Electron runs, chunk splitting (vendor/icons)
- [x] Create `EDGE/package.json` — orchestrator: `npm run dev` starts both Vite+Electron, `npm run build:exe` builds installer
- [x] Create `EDGE/frontend/src/components/common/UpdateBanner.jsx` — React banner for update notifications (invisible in browser)
- [x] Wire `UpdateBanner` into `App.jsx`
- [x] Syntax check: all 3 Electron files pass `node --check`
- [ ] **PENDING:** Add real `icon.ico` + `icon.png` to `EDGE/electron/assets/` (see ICON_REQUIRED.md)
- [ ] **PENDING:** Live test: `npm run dev` in `EDGE/` to confirm window opens (requires display)

#### 2A-2: electron-builder Config
- [ ] Create `EDGE/electron/electron-builder.yml`
  - appId: `in.iotsoft.edgefolio`
  - productName: `EDGEFOLIO`
  - target: NSIS (installer) + portable
  - icon: `EDGE/electron/assets/icon.ico` (256x256)
  - publish: GitHub (for auto-update)
- [ ] Create app icon `.ico` file (256x256 + 128 + 64 + 32 pixel sizes)
- [ ] Create NSIS installer options (silent install, desktop shortcut, start menu entry)
- [ ] Test: `npm run build:exe` produces `dist/EDGEFOLIO-Setup-1.0.0.exe`

#### 2A-3: SQLite Backend (Express server bundled in Electron)
- [ ] Install: `better-sqlite3`, `express`, `cors`, `bcryptjs`, `jsonwebtoken`
- [ ] Create `EDGE/backend/server.js` — Express app (already scaffolded, needs wiring)
- [ ] Create `EDGE/backend/db/schema.sql` — run on first launch to init SQLite
- [ ] Tables to create on first launch:
  - `employees` — id, name, dept, designation, salary_type, base_salary, shift_id, status
  - `attendance_events` — id, member_id, timestamp, event_type, source_type, device_id
  - `attendance_summary` — member_id, date, check_in, check_out, working_hours, status
  - `shifts` — id, name, start_time, end_time, grace_minutes, ot_after_minutes
  - `holidays` — date, name, type (national/custom)
  - `payroll_runs` — id, month, year, status, total_gross, total_net
  - `payslips` — id, run_id, member_id, gross, net, deductions_json
  - `leaves` — id, member_id, type, from_date, to_date, status, reason
  - `cashbook` — id, date, type, amount, category, description
  - `settings` — key, value (company name, logo, etc.)
- [ ] Create `EDGE/backend/db/init.js` — runs schema on first launch, runs migrations on updates
- [ ] Wire Express routes (already scaffolded in `EDGE/backend/routes/`) to SQLite models
- [ ] Electron main process starts Express on a random free port, passes port to renderer via env var
- [ ] Replace mock data in frontend pages with real API calls (React Query)

#### 2A-4: First-Run Setup Wizard
- [ ] Create `EDGE/frontend/src/pages/SetupWizard.jsx`
  - Step 1: Company name, logo upload, state (for PT slab), financial year start
  - Step 2: Admin password (bcrypt hashed, stored in `settings` table)
  - Step 3: Default shift setup
  - Step 4: Done → redirect to Dashboard
- [ ] App checks `settings.setup_complete` on launch → shows wizard or dashboard

#### 2A-5: Build & Test
- [ ] Build: `npm run build:exe`
- [ ] Install on a clean Windows machine (no Node.js installed) — must work
- [ ] Verify: SQLite DB created at `%APPDATA%/EDGEFOLIO/data.db`
- [ ] Verify: No terminal window visible to user
- [ ] Verify: Desktop shortcut and Start Menu entry created
- [ ] Verify: Uninstaller works cleanly

---

### Phase 2B — Biometric Machine Import
**Target:** Import attendance from any Indian factory machine via USB or Excel

#### 2B-1: ZKTeco `.dat` / `.att` USB File Parser
- [ ] Create `EDGE/backend/services/zkParser.js`
- [ ] Parse tab-separated raw log format:
  ```
  UserID \t DateTime \t Status \t VerifyType
  1      \t 2024-04-15 09:05 \t 0 \t 1
  ```
- [ ] Status mapping: `0` → CHECK_IN, `1` → CHECK_OUT, `4` → OT_START, `5` → OT_END
- [ ] Handle variations: some machines use space-separated, some use comma-separated
- [ ] Auto-detect delimiter (tab / comma / space)
- [ ] Map UserID to `member_id` via `biometric_id` field on employee record
- [ ] Deduplicate events within ±3 min window (anti-ghost punch from PRD spec)
- [ ] Create `EDGE/frontend/src/pages/ImportPage.jsx` — drag-and-drop `.dat` / `.att` / `.txt` file
- [ ] Show preview table before confirming import: `Name | Date | Check-In | Check-Out | Status`
- [ ] Show import summary: `248 records imported | 3 skipped (duplicate) | 5 unknown IDs`

#### 2B-2: Excel Import with Column Mapper
- [ ] Install: `xlsx` (SheetJS) npm package — reads `.xls` and `.xlsx`
- [ ] Create `EDGE/backend/services/excelParser.js`
- [ ] Create `EDGE/frontend/src/components/composite/ColumnMapper.jsx`
  - Read first row of Excel as column headers
  - Show drag-map UI:
    ```
    "Enroll No"  →  [ Employee ID    ▼ ]
    "Date"       →  [ Date           ▼ ]
    "Time"       →  [ Time           ▼ ]
    "Status"     →  [ Event (IN/OUT) ▼ ]
    ```
  - Save mapping as named profile (e.g., "My ZKTeco", "Hikvision Gate")
  - Reload saved profile on next import (one-time setup per machine)
- [ ] Auto-detect common column names (fuzzy match):
  - Employee ID: `No`, `Enroll No`, `UserID`, `Card No`, `ID`, `Emp ID`
  - DateTime: `Date/Time`, `Date Time`, `Punch Time`, `Time`, `Timestamp`
  - Event: `Status`, `In/Out`, `State`, `Type`, `Verify`
- [ ] Handle merged date+time column vs separate date and time columns
- [ ] Handle IN/OUT as text (`IN`, `OUT`, `C/In`, `C/Out`) vs numeric (`0`, `1`)
- [ ] Test with real exports from: ZKTime 5.0, eSSL eTIME5, Hikvision, Dahua

#### 2B-3: Machine Profile Library (Built-in Templates)
- [ ] Create `EDGE/backend/data/machineProfiles.json` — pre-built column mappings:
  ```json
  [
    { "name": "ZKTeco / ZKTime 5.0",   "cols": { "id": "No.",       "dt": "Date/Time", "status": "Verify" } },
    { "name": "eSSL eTIME5",           "cols": { "id": "Enroll No", "date": "Date",    "time": "Time", "status": "Status" } },
    { "name": "Hikvision Access",      "cols": { "id": "Card No.",  "date": "Date",    "time": "Time", "status": "Event Point" } },
    { "name": "Realtime / Anviz",      "cols": { "id": "ID",        "dt": "DateTime",  "status": "Status" } }
  ]
  ```
- [ ] Import page: "Select your machine brand" → auto-loads profile → skip column mapper

---

### Phase 2C — ZKTeco Live TCP Sync (LAN)
**Target:** Real-time attendance as employee punches — no USB required

#### 2C-1: ZK TCP Connection
- [ ] Install: `node-zklib` npm package
- [ ] Create `EDGE/backend/services/zkLiveSync.js`
  - Connect to machine via LAN IP + port 4370
  - Listen for real-time attendance events
  - Normalize to JSON attendance contract
  - Push to `attendance_events` table instantly
- [ ] Create `EDGE/frontend/src/pages/DevicesPage.jsx`
  - Add machine: IP address, port (default 4370), name, location
  - Connection status indicator (green/red)
  - Last sync timestamp
  - Manual sync button (pull all logs from machine)

#### 2C-2: Machine Registry in SQLite
- [ ] Add `devices` table:
  - id, name, ip, port, type (ZKTeco/eSSL/Hikvision), location_tag, last_sync, status
- [ ] Background service: ping each device every 60s, update status
- [ ] If device goes offline → reconnect automatically when it comes back

---

### Phase 2D — Core Business Logic
**Target:** Real payroll computation (not mock data)

#### 2D-1: Payroll Engine
- [ ] `EDGE/backend/services/payrollEngine.js` (already scaffolded — needs implementation)
- [ ] Compute for each employee per month:
  - Present days, absent days, late days, half-days, leaves
  - Gross = (base_salary / working_days) × present_days + OT amount
  - PF deduction = 12% of basic (capped at ₹1,800/month)
  - ESI deduction = 0.75% of gross (if gross ≤ ₹21,000)
  - PT deduction = state-wise slab (Maharashtra, Karnataka, etc.)
  - LOP = salary deducted for absent days beyond leave balance
  - Net = Gross − (PF + ESI + PT + LOP + Other deductions)
- [ ] Handle salary types: Monthly fixed, Daily wage, Hourly rate
- [ ] Payslip generation: HTML template → PDF (using `puppeteer` or `pdfkit`)

#### 2D-2: Leave Engine
- [ ] Leave types: Casual, Sick, Earned, Comp-off, LOP
- [ ] Leave balance ledger per employee
- [ ] Leave accrual rules (e.g., 1.5 days earned per month)
- [ ] Leave deducted from payroll automatically

#### 2D-3: Reports & Export
- [ ] Attendance register (muster roll) → Excel export
- [ ] Salary register → Excel export
- [ ] Payslip → PDF (per employee or bulk zip)
- [ ] Monthly summary → printable A4
- [ ] Install: `exceljs` for Excel generation

---

### Phase 2E — Auto-Update System
**Target:** One-click update from inside the app (non-technical user never visits GitHub)

- [ ] electron-updater checks GitHub Releases on app launch
- [ ] If new version → show banner: `"Version 1.2.0 available — What's new | Update Now"`
- [ ] Download in background → "Ready to install — Restart now?"
- [ ] GitHub Release asset: `EDGEFOLIO-Setup-1.x.x.exe` + `latest.yml` (auto-generated by electron-builder)
- [ ] Update channel: `latest` (stable) — future: `beta` channel for testing

---

## Phase 2 — Master Progress Tracker

```
Phase 2A: Electron Shell + SQLite Backend
  2A-1  Electron Setup              [x] 100% ✅ April 27, 2026
  2A-2  electron-builder Config     [ ] 0%
  2A-3  SQLite Backend              [ ] 0%
  2A-4  Setup Wizard (first-run)    [ ] 0%
  2A-5  Build & Test .exe           [ ] 0%

Phase 2B: Biometric Machine Import
  2B-1  ZKTeco .dat USB Parser      [ ] 0%
  2B-2  Excel Column Mapper         [ ] 0%
  2B-3  Machine Profile Library     [ ] 0%

Phase 2C: ZKTeco Live TCP Sync
  2C-1  ZK TCP Connection           [ ] 0%
  2C-2  Machine Registry            [ ] 0%

Phase 2D: Business Logic
  2D-1  Payroll Engine              [ ] 0%
  2D-2  Leave Engine                [ ] 0%
  2D-3  Reports & Export            [ ] 0%

Phase 2E: Auto-Update System        [ ] 0%
```

---

## Suggested Build Order (Quickest Path to Usable .exe)

```
Week 5:   2A-1 + 2A-2        → Electron window opens with existing UI
Week 5:   2A-3                → SQLite backend, Login works for real
Week 6:   2A-4 + 2A-5        → Setup wizard, build .exe, test on clean PC
Week 6:   2B-1                → ZK .dat import (highest factory demand)
Week 7:   2B-2 + 2B-3        → Excel import with column mapper
Week 7:   2D-1                → Payroll engine (core value)
Week 8:   2D-2 + 2D-3        → Leave engine + reports export
Week 8:   2E                  → Auto-update system
Week 9:   2C-1 + 2C-2        → ZK live sync (optional, nice-to-have)
Week 9:   Testing + Bug fixes
Week 10:  Release v1.1.0-beta on GitHub
```

---

## Key npm Packages for Phase 2

| Package | Purpose | Phase |
|---|---|---|
| `electron` v30 | Desktop shell | 2A |
| `electron-builder` v24 | Build `.exe` installer | 2A |
| `electron-updater` v6 | Auto-update from GitHub Releases | 2E |
| `better-sqlite3` | Fast SQLite (sync API, works in Electron) | 2A |
| `express` | Local HTTP server (already included) | 2A |
| `bcryptjs` | Password hashing | 2A |
| `jsonwebtoken` | Auth tokens | 2A |
| `node-zklib` | ZKTeco TCP live sync | 2C |
| `xlsx` (SheetJS) | Read Excel .xls / .xlsx | 2B |
| `exceljs` | Write Excel reports | 2D |
| `pdfkit` or `puppeteer` | Generate PDF payslips | 2D |
| `concurrently` | Run Vite + Electron together in dev | 2A |
| `wait-on` | Wait for Vite before opening Electron | 2A |

---

## Data Storage Locations (on user's PC)

```
%APPDATA%\EDGEFOLIO\
├── data.db              ← SQLite database (all employee + attendance data)
├── backups\             ← Local backup files (.pbbackup)
├── uploads\             ← Employee photos, documents
├── logs\                ← App logs
└── config.json          ← App config (port, theme, etc.)
```

---

## Important Notes

1. **`better-sqlite3` vs `sqlite3`** — Use `better-sqlite3`. It has synchronous API (simpler in Electron), better performance, no native rebuild headaches. Rebuild for Electron with `electron-rebuild`.

2. **Port for Express** — Use `portfinder` to pick a free port dynamically. Store it in `config.json`. Pass to renderer via `process.env.BACKEND_PORT`.

3. **Security** — Never expose Express server outside localhost. Electron's preload.js bridges only what the UI needs. No `nodeIntegration: true`.

4. **ZK `.dat` file encoding** — ZKTeco machines write files in **GB2312** (Chinese encoding), not UTF-8. Must decode with `iconv-lite` before parsing if employee names are in the file.

5. **SmartScreen warning** — First version will show "Unknown publisher" warning on Windows. This is normal. Users click "More info → Run anyway". Goes away with code-signing certificate.

---

**Last Updated:** April 27, 2026  
**Next Action:** Start with Phase 2A-1 (Electron Setup)  
**Owner:** EDGEFOLIO Dev Team
