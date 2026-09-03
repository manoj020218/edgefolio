const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');
const { monthLabel, toISODate } = require('../utils/dateUtils');
const { getLopDaysCount, getOvertimeHours } = require('./attendance');

function monthDateRange(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  return {
    daysInMonth,
    from: `${monthKey}-01`,
    to: `${monthKey}-${String(daysInMonth).padStart(2, '0')}`,
  };
}

// ─── Adjustments (bonus / reimbursement / loan EMI / other) ───────────────────

function listAdjustments(employeeId, monthKey) {
  return getDb().prepare(
    'SELECT * FROM payroll_adjustments WHERE employee_id = ? AND month_key = ? ORDER BY created_at ASC',
  ).all(employeeId, monthKey);
}

function listAdjustmentsForMonth(monthKey) {
  return getDb().prepare(
    'SELECT * FROM payroll_adjustments WHERE month_key = ? ORDER BY employee_id, created_at ASC',
  ).all(monthKey);
}

function createAdjustment({ employeeId, monthKey, kind, label, amount, notes, createdBy }) {
  const validKinds = ['bonus', 'reimbursement', 'other_earning', 'loan_emi', 'other_deduction'];
  if (!validKinds.includes(kind)) {
    throw Object.assign(new Error(`kind must be one of: ${validKinds.join(', ')}`), { statusCode: 400 });
  }
  if (!employeeId || !monthKey || !label || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    throw Object.assign(new Error('employeeId, monthKey, label and a positive amount are required'), { statusCode: 400 });
  }
  const db = getDb();
  const id = `ADJ-${randomUUID().slice(0, 8).toUpperCase()}`;
  db.prepare(
    `INSERT INTO payroll_adjustments (id, employee_id, month_key, kind, label, amount, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, employeeId, monthKey, kind, String(label).trim(), Number(amount), notes || null, createdBy || null);
  return db.prepare('SELECT * FROM payroll_adjustments WHERE id = ?').get(id);
}

function deleteAdjustment(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM payroll_adjustments WHERE id = ?').get(id);
  if (!row) throw Object.assign(new Error('Adjustment not found'), { statusCode: 404 });
  db.prepare('DELETE FROM payroll_adjustments WHERE id = ?').run(id);
  return { id, deleted: true };
}

// ─── Core calculation, shared by preview (read-only) and finalize (persists) ──

// Returns everything needed for one employee's payslip for one month, without
// writing anything — previewPayrollForMonth calls this directly (repeatable,
// safe to call many times while HR reviews); createPayrollRun calls it once
// per employee then persists the result, same as it always has.
function computeEmployeePayroll(employee, monthKey, earningsConfig, deductionsConfig) {
  const { daysInMonth, from, to } = monthDateRange(monthKey);
  const db = getDb();
  const whRow = db.prepare('SELECT hours_per_day, overtime_rate_multiplier FROM working_hours WHERE id = 1').get();
  const hoursPerDay = Number(whRow?.hours_per_day || 8);
  const overtimeMultiplier = Number(whRow?.overtime_rate_multiplier ?? 1.5);

  const basic = Number(employee.salary || 0);

  // Build earnings: basic + configured allowances
  const earnings = { basic };
  for (const ec of earningsConfig) {
    earnings[ec.name] = Number((basic * ec.percentage / 100).toFixed(2));
  }

  // Build deductions from the deductions table
  const deductions = {};
  for (const dc of deductionsConfig) {
    const key = dc.name;
    const isESI = dc.name.toUpperCase().includes('ESI');
    if (isESI && basic > 21000) {
      deductions[key] = 0;
    } else {
      deductions[key] = Number((basic * dc.percentage / 100).toFixed(2));
    }
  }

  // Loss of Pay — see getLopDaysCount's own comment for exactly what counts.
  const lopDays = getLopDaysCount(employee.id, from, to);
  if (lopDays > 0) {
    const perDayRate = basic / daysInMonth;
    deductions[`Loss of Pay (${lopDays}d)`] = Number((perDayRate * lopDays).toFixed(2));
  }

  // Overtime — hours beyond hours_per_day on days actually worked, at
  // (hourly rate × multiplier). Hourly rate derived from the same per-day
  // rate LOP uses, divided by hours_per_day, so the two stay consistent
  // with each other.
  const overtimeHours = Number(getOvertimeHours(employee.id, from, to).toFixed(2));
  if (overtimeHours > 0) {
    const hourlyRate = (basic / daysInMonth) / hoursPerDay;
    earnings[`Overtime (${overtimeHours}h)`] = Number((overtimeHours * hourlyRate * overtimeMultiplier).toFixed(2));
  }

  // Bonus / reimbursement / other adjustments HR added for this employee
  // this month — each keeps its own label as the payslip line item, not
  // lumped together, so "Diwali Bonus" and "Fuel Reimbursement" both show
  // up distinctly.
  const adjustments = listAdjustments(employee.id, monthKey);
  const earningKinds = new Set(['bonus', 'reimbursement', 'other_earning']);
  for (const adj of adjustments) {
    const bucket = earningKinds.has(adj.kind) ? earnings : deductions;
    bucket[adj.label] = Number(adj.amount);
  }

  const gross = Object.values(earnings).reduce((s, v) => s + Number(v || 0), 0);
  const totalDeductions = Object.values(deductions).reduce((s, v) => s + Number(v || 0), 0);

  return {
    basic,
    earnings,
    deductions,
    gross: Number(gross.toFixed(2)),
    netSalary: Number((gross - totalDeductions).toFixed(2)),
    lopDays,
    overtimeHours,
  };
}

// Read-only — computes every employee's payslip for a month without writing
// payroll_runs/payslips. Safe to call repeatedly while HR reviews and adds
// bonus/reimbursement adjustments before finalizing.
function previewPayrollForMonth(monthKey) {
  const db = getDb();
  const earningsConfig = db.prepare(
    "SELECT * FROM earnings_config WHERE is_active=1 ORDER BY created_at ASC",
  ).all();
  const deductionsConfig = db.prepare('SELECT * FROM deductions ORDER BY created_at ASC').all();
  const employees = db.prepare(
    'SELECT id, emp_code, name, email, phone, salary, department FROM employees ORDER BY name',
  ).all();

  const rows = employees.map((employee) => {
    const computed = computeEmployeePayroll(employee, monthKey, earningsConfig, deductionsConfig);
    return {
      employeeId: employee.id,
      empCode: employee.emp_code || null,
      employeeName: employee.name,
      department: employee.department || null,
      ...computed,
    };
  });

  return {
    monthKey,
    monthLabel: monthLabel(monthKey),
    totalEmployees: rows.length,
    totalNetPayable: Number(rows.reduce((s, r) => s + r.netSalary, 0).toFixed(2)),
    employees: rows,
  };
}

function listPayrollRuns() {
  const db = getDb();
  return db.prepare('SELECT * FROM payroll_runs ORDER BY month_key DESC').all();
}

function getPayrollRun(runId) {
  const db = getDb();
  return db.prepare('SELECT * FROM payroll_runs WHERE run_id = ?').get(runId);
}

function listPayslipsByMonth(month) {
  const db = getDb();
  const normalizedMonth =
    /^\d{4}-\d{2}$/.test(String(month || '')) ? monthLabel(month) : month;

  return db
    .prepare(`
      SELECT p.*,
             e.emp_code AS _emp_code,
             e.email    AS _employee_email,
             e.phone    AS _employee_phone
      FROM payslips p
      LEFT JOIN employees e ON e.id = p.employee_id
      WHERE p.month = ?
      ORDER BY p.employee_name
    `)
    .all(normalizedMonth)
    .map((row) => ({
      ...row,
      emp_code:       row.emp_code       || row._emp_code       || null,
      employee_email: row.employee_email || row._employee_email || null,
      employee_phone: row.employee_phone || row._employee_phone || null,
      earnings:    JSON.parse(row.earnings_json    || '{}'),
      deductions:  JSON.parse(row.deductions_json  || '{}'),
    }));
}

function listAllPayslips() {
  const db = getDb();
  return db
    .prepare(`
      SELECT p.*,
             e.emp_code AS _emp_code,
             e.email    AS _employee_email,
             e.phone    AS _employee_phone
      FROM payslips p
      LEFT JOIN employees e ON e.id = p.employee_id
      ORDER BY p.month DESC, p.employee_name ASC
    `)
    .all()
    .map((row) => ({
      ...row,
      emp_code:       row.emp_code       || row._emp_code       || null,
      employee_email: row.employee_email || row._employee_email || null,
      employee_phone: row.employee_phone || row._employee_phone || null,
      earnings:    JSON.parse(row.earnings_json    || '{}'),
      deductions:  JSON.parse(row.deductions_json  || '{}'),
    }));
}

function getPayslipById(payslipId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT p.*,
           e.emp_code AS _emp_code,
           e.email    AS _employee_email,
           e.phone    AS _employee_phone
    FROM payslips p
    LEFT JOIN employees e ON e.id = p.employee_id
    WHERE p.payslip_id = ?
  `).get(payslipId);
  if (!row) return null;
  return {
    ...row,
    emp_code:       row.emp_code       || row._emp_code       || null,
    employee_email: row.employee_email || row._employee_email || null,
    employee_phone: row.employee_phone || row._employee_phone || null,
    earnings:    JSON.parse(row.earnings_json    || '{}'),
    deductions:  JSON.parse(row.deductions_json  || '{}'),
  };
}

function createPayrollRun(monthKey, processedBy = 'admin@edgefolio.com') {
  const db = getDb();
  const runId = `PAY-${monthKey}`;
  const exists = getPayrollRun(runId);
  if (exists) return exists;

  const employeeRows = db.prepare('SELECT COUNT(*) AS count, SUM(salary) AS total FROM employees').get();
  db.prepare(
    `INSERT INTO payroll_runs (
      run_id, month_key, month_label, year, status, total_employees, processed, total_amount, processed_date, processed_by
    ) VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)`,
  ).run(
    runId, monthKey, monthLabel(monthKey),
    Number(monthKey.slice(0, 4)),
    employeeRows.count || 0, employeeRows.count || 0,
    employeeRows.total || 0, toISODate(), processedBy,
  );

  // Load configurable earnings (DA, HRA, etc.) — percentages of basic
  const earningsConfig = db.prepare(
    "SELECT * FROM earnings_config WHERE is_active=1 ORDER BY created_at ASC"
  ).all();

  // Load configurable deductions from the deductions table
  const deductionsConfig = db.prepare('SELECT * FROM deductions ORDER BY created_at ASC').all();

  const employees = db.prepare(
    'SELECT id, emp_code, name, email, phone, salary FROM employees ORDER BY id'
  ).all();

  const insertPayslip = db.prepare(`
    INSERT OR REPLACE INTO payslips (
      payslip_id, emp_code, employee_id, employee_name, employee_email, employee_phone,
      month, basic_salary, earnings_json, deductions_json, gross, net_salary, bank_account, status
    ) VALUES (
      @payslip_id, @emp_code, @employee_id, @employee_name, @employee_email, @employee_phone,
      @month, @basic_salary, @earnings_json, @deductions_json, @gross, @net_salary, @bank_account, @status
    )
  `);

  const monthText = monthLabel(monthKey);

  employees.forEach((employee) => {
    const { basic, earnings, deductions, gross, netSalary } =
      computeEmployeePayroll(employee, monthKey, earningsConfig, deductionsConfig);

    insertPayslip.run({
      payslip_id:     `SLIP-${monthKey}-${randomUUID().slice(0, 8).toUpperCase()}`,
      emp_code:        employee.emp_code || null,
      employee_id:     employee.id,
      employee_name:   employee.name,
      employee_email:  employee.email || null,
      employee_phone:  employee.phone || null,
      month:           monthText,
      basic_salary:    basic,
      earnings_json:   JSON.stringify(earnings),
      deductions_json: JSON.stringify(deductions),
      gross,
      net_salary:      netSalary,
      bank_account:    'XXXX-XXXX-XXXX-0000',
      status:          'generated',
    });
  });

  return getPayrollRun(runId);
}

function approvePayrollRun(runId, approvedBy = 'admin@edgefolio.com') {
  const db = getDb();
  db.prepare(`
    UPDATE payroll_runs
    SET status = 'approved', processed_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE run_id = ?
  `).run(approvedBy, runId);
  return getPayrollRun(runId);
}

// ─── Disputes ─────────────────────────────────────────────────────────────────

function listDisputes(status = null) {
  const db = getDb();
  if (status) {
    return db.prepare(
      "SELECT * FROM payslip_disputes WHERE status = ? ORDER BY raised_at DESC"
    ).all(status);
  }
  return db.prepare(
    "SELECT * FROM payslip_disputes ORDER BY raised_at DESC"
  ).all();
}

function countOpenDisputes() {
  return getDb().prepare(
    "SELECT COUNT(*) AS n FROM payslip_disputes WHERE status = 'open'"
  ).get().n;
}

function raiseDispute(payslipId, employeeId, reason) {
  const db = getDb();
  const slip = db.prepare('SELECT * FROM payslips WHERE payslip_id = ?').get(payslipId);
  if (!slip) throw Object.assign(new Error('Payslip not found'), { statusCode: 404 });
  if (slip.employee_id !== employeeId) {
    throw Object.assign(new Error('This payslip does not belong to the given employee'), { statusCode: 403 });
  }
  // Only one open dispute per payslip
  const existing = db.prepare(
    "SELECT * FROM payslip_disputes WHERE payslip_id = ? AND status = 'open'"
  ).get(payslipId);
  if (existing) return existing;

  const id = `DSP-${randomUUID().slice(0, 8).toUpperCase()}`;
  db.prepare(`
    INSERT INTO payslip_disputes (dispute_id, payslip_id, employee_id, employee_name, month, reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, payslipId, employeeId, slip.employee_name, slip.month, reason);
  return db.prepare('SELECT * FROM payslip_disputes WHERE dispute_id = ?').get(id);
}

function resolveDispute(disputeId, { status, notes, resolvedBy }) {
  const db = getDb();
  db.prepare(`
    UPDATE payslip_disputes
    SET status=?, resolution_notes=?, resolved_by=?, resolved_at=CURRENT_TIMESTAMP
    WHERE dispute_id=?
  `).run(status || 'resolved', notes || null, resolvedBy || null, disputeId);
  return db.prepare('SELECT * FROM payslip_disputes WHERE dispute_id = ?').get(disputeId);
}

function getDisputeForPayslip(payslipId) {
  return getDb().prepare(
    "SELECT * FROM payslip_disputes WHERE payslip_id = ? ORDER BY raised_at DESC LIMIT 1"
  ).get(payslipId);
}

module.exports = {
  listPayrollRuns,
  getPayrollRun,
  listPayslipsByMonth,
  listAllPayslips,
  getPayslipById,
  createPayrollRun,
  approvePayrollRun,
  listDisputes,
  countOpenDisputes,
  raiseDispute,
  resolveDispute,
  getDisputeForPayslip,
  previewPayrollForMonth,
  listAdjustments,
  listAdjustmentsForMonth,
  createAdjustment,
  deleteAdjustment,
};
