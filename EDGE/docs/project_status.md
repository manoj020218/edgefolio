# EDGEFOLIO Project Status

**Version:** 1.2.0-dev  
**Date:** 2026-04-29  
**Phase:** Phase 1 Complete + Phase 2 Backend Foundations

---

## Architecture Overview

```
EDGE/
  backend/         Express + better-sqlite3 (Node.js, offline-first)
  frontend/        React + Vite + TailwindCSS
  electron/        Electron shell (packages backend + frontend into .exe)
  python/          Face recognition (optional, side-car process)
```

- Backend runs on `localhost:7001` inside Electron, serves REST API
- Frontend is Vite-built static, served from `electron/main.js` via `loadFile`
- SQLite DB stored in `%APPDATA%/EDGEFOLIO/` (survives app updates)
- Backups in `%APPDATA%/EDGEFOLIO/backups/` + user-configurable external path

---

## Completed Features

### Core (v1.0.0-alpha)
- [x] Dashboard with real-time stats
- [x] Employee directory (CRUD)
- [x] Attendance management (daily register, manual check-in/out)
- [x] Payroll engine (run, approve, payslips with PDF-ready modal)
- [x] Leave management (requests, approvals, balances)
- [x] Cashbook / Expense tracking
- [x] Reports (dashboard, attendance, salary)
- [x] Settings (Company, Working Hours, Shifts, Departments, Holidays, Deductions)
- [x] Auth (JWT, admin user, password reset flow)
- [x] ZK Teco network pull — pure Node.js UDP driver, no Python required
- [x] Attendance file import (XLS, XLSX, CSV, JSON, DAT, TXT — auto column mapping)

### v1.1.0 additions
- [x] Payslip modal height-aware (no overflow on small screens)
- [x] Data & Backup system
  - User-configurable external backup path (stored in app_preferences SQLite)
  - Auto-backup before every update install
  - Restore from .pbbackup file with safety backup first
  - Version display in Settings → Data & Backup
- [x] Cashbook: custom categories + XLS export with SheetJS
- [x] ZK Teco: "Ready — no extra software needed" banner, Python dependency removed from UI

### v1.2.0 additions (current session)
- [x] Employee enhancements
  - `emp_code` (EMP001, EMP002…) — auto-assigned on first run, HR sets for new employees
  - `work_type` column (Office / Field Duty / WFH)
  - `app_role` column (User / Soft Admin — 2-level)
  - Bug fix: create employee no longer requires client to send `id` (auto-generated UUID)
  - Column picker — HR can tick checkboxes to show/hide optional columns in employee list
  - Click-to-open drawer: Tab 1 Basic Info (inline edit), Tab 2 Custom Fields
- [x] Custom field system (HR-defined)
  - `custom_field_definitions` table: field name, type (text/number/textarea/date), required flag
  - `employee_custom_values` table: per-employee values
  - Manage fields in Settings → Employee Fields
  - Edit values in Employee drawer → Custom Fields tab
- [x] Jenix OEM attendance import
  - Backend: `jenixService.js` — auto-detects separate/single-punch mode, handles Excel serial times, Chinese headers
  - Frontend: ImportModal → "Jenix OEM" tab with sheet picker dropdown (when XLS has 2+ sheets)
  - `xlsx` added to root `package.json` for backend use
- [x] Attendance Export
  - Date range picker (from / to)
  - Formats: XLSX, CSV, JSON, TXT — all client-side (no server round-trip for export)
  - Export button in Attendance page header

---

## Database Schema (v1.2.0)

**employees** — added: `emp_code`, `work_type`, `app_role`  
**custom_field_definitions** — new table  
**employee_custom_values** — new table  
**app_preferences** — key-value store (added v1.1.0)  
**backups** — backup history  

Migration strategy: `runMigrations()` in `database.js` — safe `ALTER TABLE IF NOT EXISTS` + `CREATE TABLE IF NOT EXISTS` pattern.

---

## Known Limitations / Next Phase

### Phase 2 (Electron .exe packaging)
- [ ] electron-builder config needs `icon.ico` file in `electron/assets/`
- [ ] Auto-updater requires GitHub releases with `latest.yml`
- [ ] Test NSIS installer on Windows 10 / 11

### Phase 2 (ZK Teco machine mapping)
- [ ] Machine UserID → emp_code mapping UI
  - One-time setup: HR maps machine's numeric UserID to emp_code (EMP001 etc.)
  - Saved to app_preferences, auto-applied on all future imports from that machine
- [ ] Column mapping profiles (per-machine, saved to app_preferences)

### Phase 3 (Mobile App)
- [ ] Field duty employee attendance via mobile GPS
- [ ] React Native app (expo) — basic scaffold in `mobile-app/`
- [ ] Field attendance rule engine (geo-fence based)

### Pending / Deferred
- [ ] Face recognition enrollment UI (backend service exists)
- [ ] Cloud sync (VPS at 154.61.69.200) — stub in backupService, routes wired
- [ ] SMS notifications (smsService.js stub)
- [ ] Multi-language support

---

## Build / Run

```bash
# Dev (all at once)
npm run dev:stack

# Backend only
npm run backend

# Frontend only
npm run dev:ui

# Build .exe
npm run build:exe
```

---

## Contact / Support
- WhatsApp: +917240226566
- Email: iotsoft.in@gmail.com

*(Contact info — local only, not in git)*
