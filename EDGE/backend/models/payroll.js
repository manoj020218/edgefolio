const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');
const { monthLabel, toISODate } = require('../utils/dateUtils');
const { getLopDaysCount } = require('./attendance');

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
  const [runYear, runMonth] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(runYear, runMonth, 0).getDate();
  const monthFrom = `${monthKey}-01`;
  const monthTo = `${monthKey}-${String(daysInMonth).padStart(2, '0')}`;

  employees.forEach((employee) => {
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

    // Loss of Pay — per-day rate on the actual days in this month, for days
    // HR explicitly marked absent or unpaid leave (see getLopDaysCount's own
    // comment for why "no punch" alone never counts). Only added when
    // non-zero so payslips with no LOP look exactly as they did before this.
    const lopDays = getLopDaysCount(employee.id, monthFrom, monthTo);
    if (lopDays > 0) {
      const perDayRate = basic / daysInMonth;
      deductions[`Loss of Pay (${lopDays}d)`] = Number((perDayRate * lopDays).toFixed(2));
    }

    const gross = Object.values(earnings).reduce((s, v) => s + Number(v || 0), 0);
    const totalDeductions = Object.values(deductions).reduce((s, v) => s + Number(v || 0), 0);

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
      gross:           Number(gross.toFixed(2)),
      net_salary:      Number((gross - totalDeductions).toFixed(2)),
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
};
