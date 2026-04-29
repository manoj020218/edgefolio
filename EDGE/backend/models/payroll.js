const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');
const { monthLabel, toISODate } = require('../utils/dateUtils');

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
    .prepare('SELECT * FROM payslips WHERE month = ? ORDER BY employee_name')
    .all(normalizedMonth)
    .map((row) => ({
      ...row,
      earnings: JSON.parse(row.earnings_json || '{}'),
      deductions: JSON.parse(row.deductions_json || '{}'),
    }));
}

function listAllPayslips() {
  const db = getDb();
  return db
    .prepare('SELECT * FROM payslips ORDER BY month DESC, employee_name ASC')
    .all()
    .map((row) => ({
      ...row,
      earnings: JSON.parse(row.earnings_json || '{}'),
      deductions: JSON.parse(row.deductions_json || '{}'),
    }));
}

function getPayslipById(payslipId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM payslips WHERE payslip_id = ?').get(payslipId);
  if (!row) return null;
  return {
    ...row,
    earnings: JSON.parse(row.earnings_json || '{}'),
    deductions: JSON.parse(row.deductions_json || '{}'),
  };
}

function createPayrollRun(monthKey, processedBy = 'admin@edgefolio.com') {
  const db = getDb();
  const runId = `PAY-${monthKey}`;
  const exists = getPayrollRun(runId);
  if (exists) return exists;

  const employeeRows = db.prepare('SELECT COUNT(*) AS count, SUM(salary) AS total FROM employees').get();
  db.prepare(
    `
    INSERT INTO payroll_runs (
      run_id, month_key, month_label, year, status, total_employees, processed, total_amount, processed_date, processed_by
    ) VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)
    `,
  ).run(
    runId,
    monthKey,
    monthLabel(monthKey),
    Number(monthKey.slice(0, 4)),
    employeeRows.count || 0,
    employeeRows.count || 0,
    employeeRows.total || 0,
    toISODate(),
    processedBy,
  );

  const employees = db.prepare('SELECT id, name, salary FROM employees ORDER BY id').all();
  const insertPayslip = db.prepare(
    `
    INSERT OR REPLACE INTO payslips (
      payslip_id, employee_id, employee_name, month, basic_salary, earnings_json, deductions_json, gross, net_salary, bank_account, status
    ) VALUES (
      @payslip_id, @employee_id, @employee_name, @month, @basic_salary, @earnings_json, @deductions_json, @gross, @net_salary, @bank_account, @status
    )
    `,
  );

  const monthText = monthLabel(monthKey);
  employees.forEach((employee) => {
    const basic = Number(employee.salary || 0);
    const earnings = {
      basic,
      da: Number((basic * 0.1).toFixed(2)),
      hra: Number((basic * 0.08).toFixed(2)),
      other: 0,
    };
    const deductions = {
      pf: Number((basic * 0.12).toFixed(2)),
      esi: basic <= 21000 ? Number((basic * 0.0075).toFixed(2)) : 0,
      tax: Number((basic * 0.05).toFixed(2)),
      other: 0,
    };
    const gross = earnings.basic + earnings.da + earnings.hra + earnings.other;
    const netSalary = gross - deductions.pf - deductions.esi - deductions.tax - deductions.other;

    insertPayslip.run({
      payslip_id: `SLIP-${monthKey}-${randomUUID().slice(0, 8).toUpperCase()}`,
      employee_id: employee.id,
      employee_name: employee.name,
      month: monthText,
      basic_salary: basic,
      earnings_json: JSON.stringify(earnings),
      deductions_json: JSON.stringify(deductions),
      gross,
      net_salary: Number(netSalary.toFixed(2)),
      bank_account: 'XXXX-XXXX-XXXX-0000',
      status: 'generated',
    });
  });

  return getPayrollRun(runId);
}

function approvePayrollRun(runId, approvedBy = 'admin@edgefolio.com') {
  const db = getDb();
  db.prepare(
    `
    UPDATE payroll_runs
    SET status = 'approved', processed_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE run_id = ?
    `,
  ).run(approvedBy, runId);

  return getPayrollRun(runId);
}

module.exports = {
  listPayrollRuns,
  getPayrollRun,
  listPayslipsByMonth,
  listAllPayslips,
  getPayslipById,
  createPayrollRun,
  approvePayrollRun,
};
