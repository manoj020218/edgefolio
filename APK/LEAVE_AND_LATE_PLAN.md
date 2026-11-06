# Late / early marks + requests & leave approval (cloud, app 1.0.45)

Owner request 2026-11-06: late arrival and early leave marks; leave request and approval.
Builds on ATTENDANCE_RULES_PLAN.md (shifts, day status, calendar, CSV).

## Decisions (owner, 2026-11-06)
- D1 Leave balances: **yearly quota per leave type**, set per company by owner/HR. Approving deducts.
  Unpaid leave has no quota.
- D2 Late / early: **mark + count only** — no pay cut, no half-day rule.
- D3 Scope: **app-only companies** (EdgeFolio Cloud). PC-linked companies keep approving leave in
  EdgeFolio for Windows; for them request endpoints return 409 `MANAGED_IN_EDGE` (sync is a later step).

## 1. Late arrival / early leave (cloud `lib/dayStatus.js`)
Only on a `present` day (both punches) that is a working day for the shift (not holiday / weekly off):
- `lateMinutes` = check-in − shift start, if check-in is **after start + graceMinutes**; else 0.
- `earlyMinutes` = shift end − check-out, if check-out is **before end − graceMinutes**; else 0.
- Real instants with the org time zone; overnight shifts: end is on the next day (same rule as break window).
- A day with only check-in (`incomplete`) gets `lateMinutes` from the check-in when late; earlyMinutes 0.
- Day adds `{ late:boolean, lateMinutes, early:boolean, earlyMinutes }`.
- Summary adds `{ lateDays, lateMinutes, earlyDays, earlyMinutes }`.
- CSV appends `late_minutes, early_leave_minutes` (after `day_status`).

## 2. Leave types and quota
Company leave settings (`Organisation.settings.leaveTypes`), default:
`[{ key:'casual', name:'Casual', perYear:12 }, { key:'sick', name:'Sick', perYear:6 },
  { key:'annual', name:'Earned', perYear:15 }, { key:'unpaid', name:'Unpaid', perYear:null }]`
(`perYear:null` = no limit). Keys casual / sick / annual stay compatible with the app and EDGE.
Year = calendar year (Jan–Dec) of the leave day. Days counted = working days of the employee's shift
in the range (holidays and weekly offs are not counted). `halfDay:true` allowed only when from = to → 0.5.

Balance per employee per year = perYear − approved days (− pending shown separately).

## 3. Requests (all 9 app types; leave has extra rules)
Model `EmployeeRequest` (tenant): `{ empId, type, title, details, status: pending|approved|rejected|cancelled,
 decisionNote, decidedBy (empId), decidedAt, days (leave), year (leave), bill: { data base64, mime } }`.
Types: leave, attendance_correction, advance_salary, expense, travel, shift_change, wfh, comp_off,
document_request (same list as EDGE). `bill` max 1.5 MB (expense photo), never returned in lists.

Leave rules on create: fromDate ≤ toDate, both YYYY-MM-DD, range ≤ 60 days, leaveType one of the
company keys, days > 0 (else 400 "Those days are holidays or weekly offs"), no overlap with own
pending/approved leave (409 `LEAVE_OVERLAP`), quota: days ≤ remaining (409 `LEAVE_QUOTA`, message
says how many are left). Approve re-checks quota (409 `LEAVE_QUOTA`).

Approved leave → that employee's calendar days show `leave` with `leaveType` (only working days; a punch
on that day still wins → present). Summary `leave` counts them. CSV `day_status` = leave.

## 4. API (under /api/v1/apk, JWT; `{ ok, data, meta }`)
Employee:
- `POST /requests { type, title, details, billBase64? }` → Request. Leave: `details { leaveType, fromDate, toDate, halfDay?, reason? }`; title is built by the server ("Casual leave — 10 Nov to 12 Nov (3 days)").
- `GET /requests?status=` → own Request[] newest first.
- `GET /requests/:id` → own Request.
- `POST /requests/:id/cancel` → own **pending** request → cancelled.
- `GET /leave-balance?year=` → `{ casual, sick, annual }` remaining (numbers, kept for the Home card)
  and `meta { year, types:[{ key, name, perYear, used, pending, remaining }] }` (remaining null = no limit).
Owner / HR:
- `GET /approvals?status=pending|approved|rejected|all&type=` → Request[] of everyone, each with
  `employee { empId, empCode, name, department }` and for leave `balance` (remaining for that type/year).
  `meta.pendingCount`.
- `POST /approvals/:id/approve { note? }`, `POST /approvals/:id/reject { note? }` → Request. Only
  pending. Not your own request (403) unless owner. Notifies the employee (push + inbox,
  channel `ef_requests_v2`, "Leave approved" / "Request rejected — <note>"). New request notifies
  owner/HR the same way.
- `GET /approvals/:id/bill` → `{ mime, data }`.
- `GET /leave-types` (any user) → leaveTypes. `PUT /leave-types [{ key, name, perYear }]` (owner/HR,
  app-only): keys casual/sick/annual/unpaid fixed, names and perYear editable (0–60 or null).
Request object: `{ id, type, status, title, details, days|null, decisionNote, decidedBy, decidedByName,
 decidedAt, createdAt, hasBill }`.

## 5. App (1.0.45)
- Calendar day detail: "Late 18 min" / "Left early 25 min" chips; summary chips Late · Early.
- Home: leave balance card from `meta.types` (shows the names, e.g. Earned); pending requests count.
- New request (Leave): types from `GET /leave-types`, half-day switch when one day, shows days left;
  errors LEAVE_QUOTA / LEAVE_OVERLAP shown plainly. Cancel a pending request from My Requests.
- Admin: **Approvals** screen (/admin/approvals) — Pending / Approved / Rejected tabs, card per request
  (who, type, dates, days, balance left, reason, bill photo), Approve / Reject with optional note;
  badge with pending count on the admin Home/Company entry.
- Company → **Leave types**: edit names and days per year.
- PC-linked companies: Approvals and Leave types entries hidden (requests are on the PC).

## 6. Tests (cloud)
Late/early incl. grace edge, overnight shift, incomplete day; leave days skip holiday/weekly off;
half day; quota and overlap; approve/reject/cancel; permissions (employee can't approve; HR can't
approve own); approved leave on calendar + summary + CSV; PC-linked → MANAGED_IN_EDGE.

## 7. As built (2026-11-06) — deviations from the contract above
- Create checks quota against approved days only; approve re-checks (so several pending requests can't all be approved past the quota).
- `GET /leave-balance` top-level numbers return 999 for a no-limit type; the real value is `meta.types[].remaining = null`.
- A leave range crossing 31 Dec is split by year for quota (`yearDays`); the request's `year` is the year of fromDate.
- PC-linked company: `GET /approvals` → [] (pendingCount 0); reject also → 409 MANAGED_IN_EDGE; `/leave-balance` → zeros, `meta.types` [].
- `PUT /leave-types` accepts a partial list; perYear allows halves; unpaid is always no-limit.
- Half-day leave shows as status `leave` and counts as one leave day in the summary.
- Calendar: approved leave on future working days is returned (other future days stay omitted).
- Body limit 2300 kB only on `POST /requests` (bill photo); 256 kB elsewhere.
