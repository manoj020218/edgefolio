# EDGEFOLIO Backend API Documentation

Last updated: April 27, 2026

## Base URL

- Local: `http://127.0.0.1:7001/api/v1`
- Health (no prefix): `http://127.0.0.1:7001/health`

## Response format

All successful API responses follow this structure:

```json
{
  "ok": true,
  "data": {},
  "meta": {}
}
```

Error responses:

```json
{
  "ok": false,
  "error": "Error message"
}
```

## Authentication behavior

- Current build supports offline local mode.
- If a valid bearer token is sent, it is verified.
- If no token is sent, backend falls back to local admin context for edge/offline use.

## Health

### `GET /health`
Server process health check.

### `GET /api/v1/health`
API layer health check.

## Employees

### `GET /api/v1/employees`
List all employees.

### `GET /api/v1/employees/summary`
Employee totals and department split.

### `GET /api/v1/employees/:id`
Get employee by id.

### `POST /api/v1/employees`
Create employee.

Required fields:
- `id`
- `name`
- `department`
- `salary`

### `PUT /api/v1/employees/:id`
Update employee.

### `DELETE /api/v1/employees/:id`
Delete employee.

## Attendance

### `GET /api/v1/attendance?date=YYYY-MM-DD`
List attendance by date.

### `GET /api/v1/attendance/summary?date=YYYY-MM-DD`
Daily attendance summary.

### `GET /api/v1/attendance/member/:id?from=YYYY-MM-DD&to=YYYY-MM-DD`
Member attendance history.

### `POST /api/v1/attendance/event`
Create or update attendance event.

Required fields:
- `memberId`

Optional fields:
- `date`
- `eventType` (`CHECK_IN`, `CHECK_OUT`)
- `checkIn`
- `checkOut`
- `status`
- `hoursWorked`
- `faceMatch`

### `POST /api/v1/attendance/batch`
Upsert multiple attendance events.

Required field:
- `events` (array)

## Payroll

### `GET /api/v1/payroll/runs`
List payroll runs.

### `POST /api/v1/payroll/run`
Create monthly payroll run.

Required fields:
- `monthKey` in `YYYY-MM`

### `GET /api/v1/payroll/run/:runId`
Get run details and generated payslips.

### `POST /api/v1/payroll/approve/:runId`
Approve payroll run.

### `GET /api/v1/payroll/payslips?month=YYYY-MM|Month%20YYYY`
List payslips (all or by month).

### `GET /api/v1/payroll/slip/:payslipId`
Get payslip by id.

### `POST /api/v1/payroll/preview`
Preview payroll math from `basicSalary`.

## Leaves

### `GET /api/v1/leaves`
List leave requests.

### `GET /api/v1/leaves/balances`
List leave balances.

### `POST /api/v1/leaves`
Create leave request.

Required fields:
- `employeeId`
- `leaveType`
- `fromDate`
- `toDate`

### `PATCH /api/v1/leaves/:leaveId/status`
Update leave status.

Required fields:
- `status`

## Cashbook

### `GET /api/v1/cashbook?category=all|CategoryName`
List expenses.

### `GET /api/v1/cashbook/summary`
Get expense totals and category summary.

### `POST /api/v1/cashbook`
Create expense.

Required fields:
- `category`
- `amount`
- `description`

### `PATCH /api/v1/cashbook/:expenseId/approve`
Approve expense.

### `DELETE /api/v1/cashbook/:expenseId`
Delete expense.

## Reports

### `GET /api/v1/reports/dashboard`
Dashboard totals snapshot.

### `GET /api/v1/reports/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD&dept=DeptName`
Attendance report rows.

### `GET /api/v1/reports/salary?month=YYYY-MM|Month%20YYYY&dept=DeptName`
Salary report summary + rows.

## Sync

### `GET /api/v1/sync/status`
Get sync status snapshot.

### `POST /api/v1/sync/push`
Mark a sync push cycle and update sync metrics.

## Backup

### `GET /api/v1/backup`
List backup history.

### `POST /api/v1/backup/local`
Create local backup file under `storage/backups`.

### `POST /api/v1/backup/gdrive`
Queue cloud backup request (placeholder flow).

## Quick test commands

```bash
curl http://127.0.0.1:7001/api/v1/health
curl http://127.0.0.1:7001/api/v1/employees
curl -X POST http://127.0.0.1:7001/api/v1/payroll/run -H "content-type: application/json" -d "{\"monthKey\":\"2026-05\"}"
```
