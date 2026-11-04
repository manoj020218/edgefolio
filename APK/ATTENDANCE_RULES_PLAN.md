# Attendance rules, shifts, holidays and monthly calendar — plan (app 1.0.43+)

Owner request (2026-11-04): monthly calendar from the Home date/time, green / orange / red days,
month swipe and a summary; a holiday list so holidays are not absent; shift rules (weekly off,
office time, lunch break) with Shift A / Shift B and staff assigned to a shift; net working hours in
the CSV, with a choice whether lunch counts as working time.

Scope: **EdgeFolio Cloud (company-code companies)** — server `VPS/cloud`, app `APK/mobile`.
Companies linked to EdgeFolio for Windows keep the PC as master for shifts/holidays (already synced
for holidays; shifts sync added in step 7).

## 1. Concepts

**Shift** (per company, any number; one is the default):

| Field | Example | Notes |
|---|---|---|
| name | Shift A — General | |
| start / end | 08:00 / 18:00 | end < start ⇒ overnight (night shift, already supported) |
| break start / end | 13:00 / 13:30 | optional; one break |
| breakPaid | false | **false = lunch is deducted from net hours** (decision D1) |
| weeklyOff | [Sunday] | per shift (decision D2); default Sunday only |
| graceMinutes | 10 | late-arrival tolerance (shown as "late" in a later step, not now) |
| isDefault | true | used for employees with no shift assigned |

**Employee → shift**: `Employee.shiftId` (null ⇒ company default shift). Admin sets it when inviting
or in Employees.

**Holiday** (per company): date + name; already a model, only reading exists today. Add create /
delete for owner/HR.

## 2. Day status (one rule, used by the calendar, summary and CSV)

For each employee and date (only up to today):

| Status | Rule | Calendar |
|---|---|---|
| present | check-in AND check-out recorded | 🟢 green |
| incomplete | only one of check-in / check-out (forgot to punch) | 🟠 orange |
| leave | a leave marked for the day (PC-linked companies; app leave requests come later) | 🔵 blue |
| holiday | date in the holiday list and no punch | 🟣 purple |
| weekly_off | the employee's shift weekly off and no punch | ⚪ grey |
| absent | a working day with no punch | 🔴 red |
| future | after today | no dot |

Work on a holiday / weekly off counts as **present** (shown green with a small ring = "worked on off-day").
Night shifts count on the shift's start date (already implemented).

**Monthly summary** at the top of the calendar: Present · Incomplete · Absent · Leave · Holidays ·
Weekly offs · Net hours (sum).

## 3. Hours (CSV + calendar day detail)

- **gross_minutes** = last check-out − first check-in (real instants; overnight safe).
- **break_minutes** = overlap of [check-in, check-out] with the shift break window, only when
  `breakPaid = false`; else 0.
- **net_minutes** = gross − break; **net_hours_2dp** = net / 60 rounded half-up to 2 dp.
- New CSV columns (appended — existing columns unchanged, so parsers keep working):
  `shift_name, gross_minutes, break_minutes, net_minutes, net_hours_2dp, day_status`.
  The existing `worked_minutes / worked_hours_2dp` stay = gross (documented).

## 4. Steps

1. **Cloud model + API**
   - `Shift` model; `Employee.shiftId`; seed a default "General" shift (08:00–18:00, break
     13:00–13:30 unpaid, weekly off Sunday) for every company on first use.
   - `GET/POST/PATCH/DELETE /apk/shifts` (owner/HR; cannot delete the default or a shift in use).
   - `PATCH /apk/employees/:id { shiftId }`, and `shiftId` on invite.
   - `POST/DELETE /apk/holidays` (owner/HR; app-only companies); `GET` stays.
   - `lib/dayStatus.js`: the status + hours rules above, shared by calendar, summary and CSV.
   - `GET /apk/attendance-calendar?month=` returns per-day status + net hours + summary; HR can pass
     `empId` to view any employee.
   - CSV adds the new columns.
2. **App — employee calendar sheet**: tap the date/time chip (and the existing calendar button) →
   bottom sheet with month grid, swipe left/right (and arrows) for previous/next month, coloured dots,
   summary chips on top, legend, tap a day → check-in / check-out / net hours / shift.
3. **App — admin: Shifts** (Company tab → Shifts): list + add/edit (name, times, break, "Lunch counted
   as working time" switch, weekly-off day chips, default).
4. **App — admin: Holidays** (Company tab → Holidays): year list, add (date + name), delete.
5. **App — admin: assign shift** — in the Invite employee form and in Employees (tap employee →
   Shift picker).
6. **Tests** (cloud): day status for each case, break deduction paid/unpaid, overnight + break,
   weekly off per shift, holiday, summary counts, CSV columns, permissions.
7. **PC-linked companies**: sync sends shifts + employee shift from EdgeFolio for Windows (EDGE
   already has shifts + `employees.shift_id`); app shows them read-only there.
8. Build app 1.0.43, deploy cloud, Play upload.

## 5. Decisions (owner)

Decided 2026-11-04:
- D1 lunch: **per-shift switch "Lunch counted as working time", default OFF (deducted)**.
- D2 weekly off: **per shift**, default Sunday.
- D3 PC-linked companies: **PC is master; app shows shifts/holidays read-only**.
- D4 short day: **green (present), hours shown**; no half-day rule now.

## 6. API contract (server and app build against exactly this)

All under `/api/v1/apk`, JWT auth, responses `{ ok, data, meta }`. Times "HH:MM". Weekdays 0=Sun..6=Sat.

Shift object:
`{ id, name, start, end, breakStart|null, breakEnd|null, breakPaid:boolean, weeklyOff:number[], graceMinutes, isDefault, overnight:boolean, employees:number }`

- `GET  /shifts` → Shift[] (any logged-in user; auto-creates the default "General" shift
  08:00–18:00, break 13:00–13:30, breakPaid false, weeklyOff [0], grace 10, isDefault true).
- `POST /shifts` (owner/hr-admin, app-only companies) body = Shift fields without id/overnight/employees → Shift.
- `PATCH /shifts/:id` same fields (partial) → Shift. Setting isDefault true unsets the others.
- `DELETE /shifts/:id` → `{ deleted:true }`; 409 `SHIFT_IN_USE` if employees assigned, 409 `SHIFT_DEFAULT` for the default.
- PC-linked company: POST/PATCH/DELETE → 409 `MANAGED_IN_EDGE`.
- `PATCH /employees/:id { shiftId }` (owner/hr-admin; null = default). `POST /employees` accepts `shiftId`.
  `GET /employees` rows add `shiftId`.
- `GET /holidays?year=YYYY` → `[{ id, date, name }]` (exists at /api/v1/holidays; also served here).
- `POST /holidays { date:'YYYY-MM-DD', name }` (owner/hr-admin, app-only) → holiday; 409 `HOLIDAY_EXISTS` same date.
- `DELETE /holidays/:id` → `{ deleted:true }`.
- `GET /attendance-calendar?month=YYYY-MM[&empId=]` (empId only for owner/hr-admin) →
  `data: Day[]`, `meta: { month, shift:{id,name,start,end,breakStart,breakEnd,breakPaid,weeklyOff}, summary }`
  Day = `{ date, status, checkIn, checkOut, overnight, grossMinutes, breakMinutes, netMinutes, netHours, worked_on_off_day:boolean, holidayName|null, leaveType|null }`
  status ∈ present | incomplete | leave | holiday | weekly_off | absent (dates after today are omitted).
  summary = `{ present, incomplete, absent, leave, holidays, weeklyOffs, netMinutes, netHours }`.
  (Existing fields checkIn/checkOut/hoursWorked/leaveType kept for older app versions: hoursWorked = netHours.)
- CSV appends columns: `shift_name, gross_minutes, break_minutes, net_minutes, net_hours_2dp, day_status`.

## Out of scope (later)
Late-arrival / early-leave marks and penalties, leave requests & approvals in the app, overtime,
rotating rosters.
