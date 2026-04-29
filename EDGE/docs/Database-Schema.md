# EDGEFOLIO SQLite Database Schema

Last updated: April 27, 2026

## Database location

- Default path: `EDGE/storage/database/edgefolio.db`
- Config override: `EDGEFOLIO_DB_PATH` environment variable
- Engine: SQLite (`better-sqlite3`)
- Mode: WAL + foreign keys enabled

## Initialization flow

1. Backend starts and calls `backend/config/database.js`.
2. Schema from `backend/migrations/sqlite-schema.sql` is executed.
3. Seed data is inserted if `employees` table is empty.
4. Default admin user is ensured in `users` table.

## Tables

### `employees`
Core employee master.

Key columns:
- `id` (PK)
- `name`
- `department`
- `salary`
- `status`

### `attendance_records`
Daily attendance records per employee.

Key columns:
- `event_id` (PK)
- `member_id` (FK -> `employees.id`)
- `date`
- `check_in`
- `check_out`
- `hours_worked`
- `face_match`

Indexes:
- Unique index on `(member_id, date)`

### `payroll_runs`
Monthly payroll run headers.

Key columns:
- `run_id` (PK)
- `month_key` (`YYYY-MM`)
- `month_label`
- `status`
- `total_amount`

### `payslips`
Per-employee monthly payslip rows.

Key columns:
- `payslip_id` (PK)
- `employee_id` (FK -> `employees.id`)
- `month`
- `basic_salary`
- `earnings_json`
- `deductions_json`
- `net_salary`

### `leave_requests`
Leave application records.

Key columns:
- `leave_id` (PK)
- `employee_id` (FK -> `employees.id`)
- `leave_type`
- `from_date`
- `to_date`
- `status`

### `leave_balances`
Per employee leave quota/balance.

Key columns:
- `employee_id` (PK, FK -> `employees.id`)
- `annual`
- `sick`
- `casual`

### `expenses`
Cashbook expense records.

Key columns:
- `expense_id` (PK)
- `date`
- `category`
- `amount`
- `status`

### `company_settings`
Singleton company profile (`id = 1`).

Key columns:
- `id` (PK + check `= 1`)
- `company_name`
- `phone`
- `email`
- `gst_number`

### `working_hours`
Singleton working policy (`id = 1`).

Key columns:
- `id` (PK + check `= 1`)
- `start_time`
- `end_time`
- `break_duration`
- `days_per_week`

### `shifts`
Shift definitions.

Key columns:
- `shift_id` (PK)
- `shift_name`
- `start_time`
- `end_time`

### `loans`
Loan/advance ledger.

Key columns:
- `loan_id` (PK)
- `employee_id` (FK -> `employees.id`)
- `principal_amount`
- `outstanding_amount`
- `emi_amount`
- `status`

### `holidays`
Holiday calendar.

Key columns:
- `holiday_id` (PK)
- `date`
- `name`
- `type`

### `deductions`
Deduction definitions.

Key columns:
- `deduction_id` (PK)
- `name`
- `percentage`
- `type`

### `backups`
Backup operation history.

Key columns:
- `backup_id` (PK)
- `file_name`
- `size`
- `status`
- `backup_type`

### `sync_status`
Singleton sync health (`id = 1`).

Key columns:
- `id` (PK + check `= 1`)
- `last_sync`
- `next_sync`
- `sync_status`
- `records_synced`

### `users`
Local auth users.

Key columns:
- `id` (PK)
- `email` (unique)
- `password_hash`
- `role`

## Relationships

- `attendance_records.member_id` -> `employees.id`
- `payslips.employee_id` -> `employees.id`
- `leave_requests.employee_id` -> `employees.id`
- `leave_balances.employee_id` -> `employees.id`
- `loans.employee_id` -> `employees.id`

All foreign keys use `ON DELETE CASCADE`.

## Useful SQL snippets

Count employees:

```sql
SELECT COUNT(*) FROM employees;
```

Latest payroll runs:

```sql
SELECT run_id, month_key, status, total_amount
FROM payroll_runs
ORDER BY month_key DESC
LIMIT 10;
```

Attendance for a day:

```sql
SELECT * FROM attendance_records WHERE date = '2026-04-24';
```
