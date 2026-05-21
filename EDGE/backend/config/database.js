const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const Database = require('better-sqlite3');
const { DB_PATH, STORAGE_DIR } = require('./app');
const seedData = require('./seedData');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function ensureAdminUser(db) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return;
  db.prepare(
    'INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)',
  ).run(randomUUID(), 'admin@edgefolio.com', hashPassword('password'), 'admin');
}

let dbInstance = null;

function runSchema(db) {
  const schemaPath = path.resolve(__dirname, '..', 'migrations', 'sqlite-schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);
}

function columnExists(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

function runMigrations(db) {
  // employees
  if (!columnExists(db, 'employees', 'allow_remote_attendance')) {
    db.exec('ALTER TABLE employees ADD COLUMN allow_remote_attendance INTEGER NOT NULL DEFAULT 0');
  }
  // attendance_records
  const arCols = ['location_json', 'attendance_mode', 'device_id', 'apk_source'];
  const arDefaults = ['NULL', "'office'", 'NULL', '0'];
  arCols.forEach((col, i) => {
    if (!columnExists(db, 'attendance_records', col)) {
      db.exec(`ALTER TABLE attendance_records ADD COLUMN ${col} ${i === 3 ? 'INTEGER NOT NULL DEFAULT 0' : `TEXT${i === 1 ? " NOT NULL DEFAULT 'office'" : ''}`}`);
    }
  });
  // users
  if (!columnExists(db, 'users', 'password_must_change')) {
    db.exec('ALTER TABLE users ADD COLUMN password_must_change INTEGER NOT NULL DEFAULT 0');
  }
  if (!columnExists(db, 'users', 'temp_password_hash')) {
    db.exec('ALTER TABLE users ADD COLUMN temp_password_hash TEXT');
  }
  // shifts
  if (!columnExists(db, 'shifts', 'is_overnight')) {
    db.exec('ALTER TABLE shifts ADD COLUMN is_overnight INTEGER NOT NULL DEFAULT 0');
  }
  if (!columnExists(db, 'shifts', 'grace_minutes')) {
    db.exec('ALTER TABLE shifts ADD COLUMN grace_minutes INTEGER NOT NULL DEFAULT 10');
  }
  // app_preferences (v1.1.0)
  db.exec(`CREATE TABLE IF NOT EXISTS app_preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  // employees v1.2.0 — emp_code, work_type, app_role
  if (!columnExists(db, 'employees', 'emp_code')) {
    db.exec('ALTER TABLE employees ADD COLUMN emp_code TEXT');
  }
  if (!columnExists(db, 'employees', 'work_type')) {
    db.exec("ALTER TABLE employees ADD COLUMN work_type TEXT NOT NULL DEFAULT 'office'");
  }
  if (!columnExists(db, 'employees', 'app_role')) {
    db.exec("ALTER TABLE employees ADD COLUMN app_role TEXT NOT NULL DEFAULT 'user'");
  }
  // auto-assign emp_code to existing employees that have none
  {
    const unassigned = db.prepare("SELECT id FROM employees WHERE emp_code IS NULL OR emp_code = '' ORDER BY created_at ASC").all();
    if (unassigned.length) {
      const maxRow = db.prepare("SELECT MAX(CAST(SUBSTR(emp_code, 4) AS INTEGER)) AS n FROM employees WHERE emp_code LIKE 'EMP%'").get();
      let counter = (maxRow?.n || 0) + 1;
      const upd = db.prepare('UPDATE employees SET emp_code = ? WHERE id = ?');
      const tx = db.transaction(() => {
        for (const row of unassigned) {
          upd.run(`EMP${String(counter).padStart(3, '0')}`, row.id);
          counter++;
        }
      });
      tx();
    }
  }
  // earnings config table (v1.3.0)
  db.exec(`CREATE TABLE IF NOT EXISTS earnings_config (
    earning_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    percentage REAL NOT NULL DEFAULT 0,
    type TEXT NOT NULL DEFAULT 'fixed',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  // seed default earnings if table is empty
  {
    const n = db.prepare('SELECT COUNT(*) AS n FROM earnings_config').get().n;
    if (n === 0) {
      const ins = db.prepare("INSERT OR IGNORE INTO earnings_config (earning_id, name, percentage, type) VALUES (?, ?, ?, ?)");
      ins.run('EAR-001', 'DA',  10,  'fixed');
      ins.run('EAR-002', 'HRA',  8,  'fixed');
    }
  }
  // payslip_disputes table (v1.3.0)
  db.exec(`CREATE TABLE IF NOT EXISTS payslip_disputes (
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
  )`);
  // emp_code on payslips (v1.3.0)
  if (!columnExists(db, 'payslips', 'emp_code')) {
    db.exec('ALTER TABLE payslips ADD COLUMN emp_code TEXT');
  }
  // employee_email / employee_phone on payslips for share features (v1.3.0)
  if (!columnExists(db, 'payslips', 'employee_email')) {
    db.exec('ALTER TABLE payslips ADD COLUMN employee_email TEXT');
  }
  if (!columnExists(db, 'payslips', 'employee_phone')) {
    db.exec('ALTER TABLE payslips ADD COLUMN employee_phone TEXT');
  }
  // machine import staging tables (v1.3.0)
  db.exec(`CREATE TABLE IF NOT EXISTS machine_id_mappings (
    machine_emp_id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    machine_name TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS machine_import_staging (
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
    am_in TEXT, am_out TEXT,
    pm_in TEXT, pm_out TEXT,
    over_in TEXT, over_out TEXT,
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
  )`);
  // employees bank fields (v1.4.0)
  ['bank_account_number', 'bank_ifsc', 'bank_name'].forEach((col) => {
    if (!columnExists(db, 'employees', col)) {
      db.exec(`ALTER TABLE employees ADD COLUMN ${col} TEXT`);
    }
  });
  if (!columnExists(db, 'employees', 'payment_mode')) {
    db.exec("ALTER TABLE employees ADD COLUMN payment_mode TEXT NOT NULL DEFAULT 'NEFT'");
  }
  // bank payment tables (v1.4.0)
  db.exec(`CREATE TABLE IF NOT EXISTS bank_templates (
    template_id TEXT PRIMARY KEY,
    template_name TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    export_format TEXT NOT NULL DEFAULT 'csv',
    field_mappings TEXT NOT NULL DEFAULT '{}',
    payer_account TEXT,
    payer_ifsc TEXT,
    payer_name TEXT,
    purpose_code TEXT NOT NULL DEFAULT 'SALARY',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS payment_batches (
    batch_id TEXT PRIMARY KEY,
    month_key TEXT NOT NULL,
    month_label TEXT NOT NULL,
    template_id TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    total_employees INTEGER NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    paid_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS payment_records (
    record_id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    payslip_id TEXT,
    employee_id TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    emp_code TEXT,
    account_name TEXT,
    account_number TEXT,
    ifsc TEXT,
    bank_name TEXT,
    amount REAL NOT NULL DEFAULT 0,
    mode TEXT NOT NULL DEFAULT 'NEFT',
    purpose_code TEXT NOT NULL DEFAULT 'SALARY',
    currency TEXT NOT NULL DEFAULT 'INR',
    payment_date TEXT,
    bank_transaction_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error_reason TEXT,
    remarks TEXT,
    employee_email TEXT,
    employee_phone TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(batch_id) REFERENCES payment_batches(batch_id) ON DELETE CASCADE
  )`);
  // U5 face recognition devices (v1.5.0)
  db.exec(`CREATE TABLE IF NOT EXISTS u5_devices (
    id TEXT PRIMARY KEY,
    device_name TEXT NOT NULL,
    device_sn TEXT NOT NULL UNIQUE,
    connection_mode TEXT NOT NULL DEFAULT 'embedded',
    mqtt_token TEXT NOT NULL DEFAULT 'edge',
    vps_host TEXT,
    vps_port INTEGER NOT NULL DEFAULT 1883,
    vps_username TEXT,
    vps_password TEXT,
    embedded_port INTEGER NOT NULL DEFAULT 1883,
    status TEXT NOT NULL DEFAULT 'offline',
    last_seen TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  // U5 HTTP polling mode columns (v1.6.0) — added for direct HTTP connection (no MQTT broker needed)
  ['device_ip', 'device_password'].forEach(col => {
    if (!columnExists(db, 'u5_devices', col)) {
      db.exec(`ALTER TABLE u5_devices ADD COLUMN ${col} TEXT`);
    }
  });
  if (!columnExists(db, 'u5_devices', 'device_port')) {
    db.exec('ALTER TABLE u5_devices ADD COLUMN device_port INTEGER NOT NULL DEFAULT 80');
  }
  if (!columnExists(db, 'u5_devices', 'last_polled_at')) {
    db.exec('ALTER TABLE u5_devices ADD COLUMN last_polled_at TEXT');
  }

  // custom field tables (v1.2.0)
  db.exec(`CREATE TABLE IF NOT EXISTS custom_field_definitions (
    field_id TEXT PRIMARY KEY,
    field_name TEXT NOT NULL,
    field_type TEXT NOT NULL DEFAULT 'text',
    is_required INTEGER NOT NULL DEFAULT 0,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS employee_custom_values (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL,
    field_id TEXT NOT NULL,
    value TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY(field_id) REFERENCES custom_field_definitions(field_id) ON DELETE CASCADE,
    UNIQUE(employee_id, field_id)
  )`);
}

function seedIfEmpty(db) {
  const employeeCount = db.prepare('SELECT COUNT(*) AS count FROM employees').get().count;
  if (employeeCount > 0) return;

  const insertEmployee = db.prepare(`
    INSERT INTO employees (
      id, name, email, phone, department, designation, joining_date, salary, status, avatar
    ) VALUES (
      @id, @name, @email, @phone, @department, @designation, @joiningDate, @salary, @status, @avatar
    )
  `);

  const insertAttendance = db.prepare(`
    INSERT INTO attendance_records (
      event_id, member_id, date, check_in, check_out, status, hours_worked, face_match
    ) VALUES (
      @eventId, @memberId, @date, @checkIn, @checkOut, @status, @hoursWorked, @faceMatch
    )
  `);

  const insertPayrollRun = db.prepare(`
    INSERT INTO payroll_runs (
      run_id, month_key, month_label, year, status, total_employees, processed, total_amount, processed_date, processed_by
    ) VALUES (
      @runId, @monthKey, @monthLabel, @year, @status, @totalEmployees, @processed, @totalAmount, @processedDate, @processedBy
    )
  `);

  const insertPayslip = db.prepare(`
    INSERT INTO payslips (
      payslip_id, employee_id, employee_name, month, basic_salary, earnings_json, deductions_json, gross, net_salary, bank_account, status
    ) VALUES (
      @payslipId, @employeeId, @employeeName, @month, @basicSalary, @earningsJson, @deductionsJson, @gross, @netSalary, @bankAccount, @status
    )
  `);

  const insertLeave = db.prepare(`
    INSERT INTO leave_requests (
      leave_id, employee_id, employee_name, leave_type, from_date, to_date, days, reason, status, request_date, approved_by
    ) VALUES (
      @leaveId, @employeeId, @employeeName, @leaveType, @fromDate, @toDate, @days, @reason, @status, @requestDate, @approvedBy
    )
  `);

  const insertLeaveBalance = db.prepare(`
    INSERT INTO leave_balances (employee_id, annual, sick, casual)
    VALUES (@employeeId, @annual, @sick, @casual)
  `);

  const insertExpense = db.prepare(`
    INSERT INTO expenses (
      expense_id, date, category, amount, description, vendor, receipt, status
    ) VALUES (
      @expenseId, @date, @category, @amount, @description, @vendor, @receipt, @status
    )
  `);

  const insertShift = db.prepare(`
    INSERT INTO shifts (
      shift_id, shift_name, start_time, end_time, break_duration, employees
    ) VALUES (
      @shiftId, @shiftName, @startTime, @endTime, @breakDuration, @employees
    )
  `);

  const insertHoliday = db.prepare(`
    INSERT INTO holidays (
      holiday_id, date, name, type
    ) VALUES (
      @holidayId, @date, @name, @type
    )
  `);

  const insertDeduction = db.prepare(`
    INSERT INTO deductions (
      deduction_id, name, percentage, type
    ) VALUES (
      @deductionId, @name, @percentage, @type
    )
  `);

  const insertDepartment = db.prepare(`
    INSERT OR IGNORE INTO departments (dept_id, name, description)
    VALUES (@deptId, @name, @description)
  `);

  const tx = db.transaction(() => {
    seedData.employees.forEach((row) => insertEmployee.run(row));
    seedData.attendance.forEach((row) => insertAttendance.run(row));
    seedData.payrollRuns.forEach((row) => insertPayrollRun.run(row));
    seedData.payslips.forEach((row) =>
      insertPayslip.run({
        ...row,
        earningsJson: JSON.stringify(row.earnings),
        deductionsJson: JSON.stringify(row.deductions),
      }),
    );
    seedData.leaves.forEach((row) => insertLeave.run(row));
    seedData.leaveBalances.forEach((row) => insertLeaveBalance.run(row));
    seedData.expenses.forEach((row) => insertExpense.run(row));
    seedData.shifts.forEach((row) => insertShift.run(row));
    seedData.holidays.forEach((row) => insertHoliday.run(row));
    seedData.deductions.forEach((row) => insertDeduction.run(row));
    seedData.departments.forEach((row) => insertDepartment.run(row));

    db.prepare(
      `
      INSERT INTO company_settings (
        id, company_name, address, city, state, country, pincode, phone, email, gst_number, pan_number, website
      ) VALUES (
        1, @companyName, @address, @city, @state, @country, @pincode, @phone, @email, @gstNumber, @panNumber, @website
      )
      `,
    ).run(seedData.companySettings);

    db.prepare(
      `
      INSERT INTO working_hours (
        id, start_time, end_time, break_duration, days_per_week, hours_per_day
      ) VALUES (
        1, @startTime, @endTime, @breakDuration, @daysPerWeek, @hoursPerDay
      )
      `,
    ).run(seedData.workingHours);

    db.prepare(
      `
      INSERT INTO sync_status (
        id, last_sync, next_sync, sync_status, records_synced, records_new, records_modified, offline_mode, pending_changes
      ) VALUES (
        1, '2026-04-24 15:30:45', '2026-04-24 20:00:00', 'completed', 1245, 45, 12, 0, 0
      )
      `,
    ).run();
  });

  tx();
}

function getDb() {
  if (dbInstance) return dbInstance;

  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  dbInstance = new Database(DB_PATH);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  runSchema(dbInstance);
  runMigrations(dbInstance);
  try {
    seedIfEmpty(dbInstance);
  } catch (e) {
    console.error('[EDGEFOLIO] seed failed (non-fatal):', e.message);
  }
  ensureAdminUser(dbInstance);
  return dbInstance;
}

function closeDb() {
  if (!dbInstance) return;
  dbInstance.close();
  dbInstance = null;
}

module.exports = {
  getDb,
  closeDb,
};
