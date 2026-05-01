PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  emp_code TEXT,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  department TEXT NOT NULL,
  designation TEXT,
  joining_date TEXT,
  salary REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  avatar TEXT,
  work_type TEXT NOT NULL DEFAULT 'office',
  app_role TEXT NOT NULL DEFAULT 'user',
  allow_remote_attendance INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS custom_field_definitions (
  field_id TEXT PRIMARY KEY,
  field_name TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text',
  is_required INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employee_custom_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY(field_id) REFERENCES custom_field_definitions(field_id) ON DELETE CASCADE,
  UNIQUE(employee_id, field_id)
);

CREATE TABLE IF NOT EXISTS attendance_records (
  event_id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  status TEXT NOT NULL DEFAULT 'present',
  hours_worked REAL NOT NULL DEFAULT 0,
  face_match REAL NOT NULL DEFAULT 0,
  location_json TEXT,
  attendance_mode TEXT NOT NULL DEFAULT 'office',
  device_id TEXT,
  apk_source INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(member_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_member_date
ON attendance_records(member_id, date);

CREATE TABLE IF NOT EXISTS payroll_runs (
  run_id TEXT PRIMARY KEY,
  month_key TEXT NOT NULL,
  month_label TEXT NOT NULL,
  year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  total_employees INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  processed_date TEXT,
  processed_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payslips (
  payslip_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  month TEXT NOT NULL,
  basic_salary REAL NOT NULL DEFAULT 0,
  earnings_json TEXT NOT NULL DEFAULT '{}',
  deductions_json TEXT NOT NULL DEFAULT '{}',
  gross REAL NOT NULL DEFAULT 0,
  net_salary REAL NOT NULL DEFAULT 0,
  bank_account TEXT,
  status TEXT NOT NULL DEFAULT 'generated',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS leave_requests (
  leave_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  leave_type TEXT NOT NULL,
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  days INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  request_date TEXT NOT NULL,
  approved_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS leave_balances (
  employee_id TEXT PRIMARY KEY,
  annual INTEGER NOT NULL DEFAULT 0,
  sick INTEGER NOT NULL DEFAULT 0,
  casual INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expenses (
  expense_id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  vendor TEXT,
  receipt TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS company_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  company_name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  pincode TEXT,
  phone TEXT,
  email TEXT,
  gst_number TEXT,
  pan_number TEXT,
  website TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS working_hours (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  break_duration INTEGER NOT NULL DEFAULT 60,
  days_per_week INTEGER NOT NULL DEFAULT 5,
  hours_per_day REAL NOT NULL DEFAULT 8,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shifts (
  shift_id TEXT PRIMARY KEY,
  shift_name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  break_duration INTEGER NOT NULL DEFAULT 60,
  is_overnight INTEGER NOT NULL DEFAULT 0,
  grace_minutes INTEGER NOT NULL DEFAULT 10,
  employees INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS departments (
  dept_id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loans (
  loan_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  principal_amount REAL NOT NULL DEFAULT 0,
  outstanding_amount REAL NOT NULL DEFAULT 0,
  emi_amount REAL NOT NULL DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS holidays (
  holiday_id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'custom',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deductions (
  deduction_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  percentage REAL NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'fixed',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS backups (
  backup_id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  size TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  backup_type TEXT NOT NULL DEFAULT 'incremental',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sync_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_sync TEXT,
  next_sync TEXT,
  sync_status TEXT NOT NULL DEFAULT 'idle',
  records_synced INTEGER NOT NULL DEFAULT 0,
  records_new INTEGER NOT NULL DEFAULT 0,
  records_modified INTEGER NOT NULL DEFAULT 0,
  offline_mode INTEGER NOT NULL DEFAULT 0,
  pending_changes INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  password_must_change INTEGER NOT NULL DEFAULT 0,
  temp_password_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id TEXT PRIMARY KEY,
  emp_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  temp_password_hash TEXT,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT,
  used_at TEXT,
  FOREIGN KEY(emp_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'general',
  message TEXT NOT NULL,
  announced_by_emp_id TEXT,
  announced_by_name TEXT NOT NULL,
  announced_by_designation TEXT,
  target TEXT NOT NULL DEFAULT 'all',
  send_sms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(announced_by_emp_id) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS app_preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS face_enrollments (
  emp_id TEXT PRIMARY KEY,
  angle_front INTEGER NOT NULL DEFAULT 0,
  angle_right INTEGER NOT NULL DEFAULT 0,
  angle_left INTEGER NOT NULL DEFAULT 0,
  enrolled_by TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(emp_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- Configurable earnings components (DA, HRA, etc.) used in payroll calculation
CREATE TABLE IF NOT EXISTS earnings_config (
  earning_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  percentage REAL NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'fixed',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Payslip disputes raised by employees (from APK or manually)
CREATE TABLE IF NOT EXISTS payslip_disputes (
  dispute_id TEXT PRIMARY KEY,
  payslip_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  month TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  raised_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  resolved_by TEXT,
  resolution_notes TEXT,
  FOREIGN KEY(payslip_id) REFERENCES payslips(payslip_id) ON DELETE CASCADE,
  FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- Machine attendance import: maps machine enrollment numbers to employee UUIDs
CREATE TABLE IF NOT EXISTS machine_id_mappings (
  machine_emp_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  machine_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- Staging area for raw machine data — no FK on machine_emp_id intentionally
CREATE TABLE IF NOT EXISTS machine_import_staging (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_batch TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'alog',
  record_type TEXT NOT NULL DEFAULT 'punch',
  machine_emp_id TEXT NOT NULL,
  machine_name TEXT,
  department TEXT,
  punch_date TEXT NOT NULL,
  punch_time TEXT,
  direction TEXT,
  check_in TEXT,
  check_out TEXT,
  am_in TEXT,
  am_out TEXT,
  pm_in TEXT,
  pm_out TEXT,
  over_in TEXT,
  over_out TEXT,
  hours_overtime TEXT,
  late_mins TEXT,
  early_leave_mins TEXT,
  remark TEXT,
  tm_no TEXT,
  mode TEXT,
  raw_json TEXT,
  mapped_employee_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
