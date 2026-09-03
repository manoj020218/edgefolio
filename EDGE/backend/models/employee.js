'use strict';
const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');

function getNextEmpCode(db) {
  const row = db.prepare("SELECT MAX(CAST(SUBSTR(emp_code, 4) AS INTEGER)) AS n FROM employees WHERE emp_code LIKE 'EMP%'").get();
  return `EMP${String((row?.n || 0) + 1).padStart(3, '0')}`;
}

function listEmployees() {
  const db = getDb();
  return db.prepare('SELECT * FROM employees ORDER BY emp_code, id').all();
}

function findEmployeeById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
}

function assertValidSalary(value) {
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) {
    const err = new Error('Salary must be a positive number');
    err.statusCode = 400;
    throw err;
  }
  return n;
}

function createEmployee(payload) {
  const db = getDb();
  const id = payload.id || randomUUID();
  const empCode = payload.empCode || payload.emp_code || getNextEmpCode(db);

  const row = {
    id,
    emp_code: empCode,
    name: payload.name,
    email: payload.email || null,
    phone: payload.phone || null,
    department: payload.department,
    designation: payload.designation || null,
    joining_date: payload.joiningDate || payload.joining_date || null,
    salary: assertValidSalary(payload.salary || 0),
    status: payload.status || 'active',
    avatar: payload.avatar || null,
    work_type: payload.workType || payload.work_type || 'office',
    app_role: payload.appRole || payload.app_role || 'user',
    allow_remote_attendance: payload.allowRemoteAttendance ? 1 : 0,
  };

  db.prepare(`
    INSERT INTO employees (
      id, emp_code, name, email, phone, department, designation, joining_date,
      salary, status, avatar, work_type, app_role, allow_remote_attendance
    ) VALUES (
      @id, @emp_code, @name, @email, @phone, @department, @designation, @joining_date,
      @salary, @status, @avatar, @work_type, @app_role, @allow_remote_attendance
    )
  `).run(row);

  return findEmployeeById(id);
}

function updateEmployee(id, payload) {
  const db = getDb();
  const existing = findEmployeeById(id);
  if (!existing) return null;

  const next = {
    id: existing.id,
    emp_code: payload.empCode ?? payload.emp_code ?? existing.emp_code,
    name: payload.name ?? existing.name,
    email: payload.email ?? existing.email,
    phone: payload.phone ?? existing.phone,
    department: payload.department ?? existing.department,
    designation: payload.designation ?? existing.designation,
    joining_date: payload.joiningDate ?? payload.joining_date ?? existing.joining_date,
    salary: assertValidSalary(payload.salary ?? existing.salary ?? 0),
    status: payload.status ?? existing.status,
    avatar: payload.avatar ?? existing.avatar,
    work_type: payload.workType ?? payload.work_type ?? existing.work_type ?? 'office',
    app_role: payload.appRole ?? payload.app_role ?? existing.app_role ?? 'user',
    allow_remote_attendance: payload.allowRemoteAttendance != null
      ? (payload.allowRemoteAttendance ? 1 : 0)
      : (existing.allow_remote_attendance ?? 0),
    bank_account_number: payload.bankAccountNumber ?? payload.bank_account_number ?? existing.bank_account_number ?? null,
    bank_ifsc: payload.bankIfsc ?? payload.bank_ifsc ?? existing.bank_ifsc ?? null,
    bank_name: payload.bankName ?? payload.bank_name ?? existing.bank_name ?? null,
    payment_mode: payload.paymentMode ?? payload.payment_mode ?? existing.payment_mode ?? 'NEFT',
    // Explicit per-employee salary policy override — highest precedence in
    // resolveSalaryPolicyForEmployee, above designation/department
    // assignment. Empty string clears it back to "(use assigned policy)".
    salary_policy_group_id: payload.salaryPolicyGroupId !== undefined
      ? (payload.salaryPolicyGroupId || null)
      : (payload.salary_policy_group_id !== undefined ? (payload.salary_policy_group_id || null) : existing.salary_policy_group_id),
    // Same explicit-override pattern for salary structure (which
    // components/percentages make up pay) — highest precedence in
    // resolveSalaryStructureForEmployee, above designation/department
    // assignment. Empty string clears it back to "(use assigned structure)".
    salary_structure_group_id: payload.salaryStructureGroupId !== undefined
      ? (payload.salaryStructureGroupId || null)
      : (payload.salary_structure_group_id !== undefined ? (payload.salary_structure_group_id || null) : existing.salary_structure_group_id),
    updated_at: new Date().toISOString(),
  };

  db.prepare(`
    UPDATE employees
    SET emp_code=@emp_code, name=@name, email=@email, phone=@phone, department=@department,
        designation=@designation, joining_date=@joining_date, salary=@salary,
        status=@status, avatar=@avatar, work_type=@work_type, app_role=@app_role,
        allow_remote_attendance=@allow_remote_attendance,
        bank_account_number=@bank_account_number, bank_ifsc=@bank_ifsc,
        bank_name=@bank_name, payment_mode=@payment_mode,
        salary_policy_group_id=@salary_policy_group_id,
        salary_structure_group_id=@salary_structure_group_id,
        updated_at=@updated_at
    WHERE id=@id
  `).run(next);

  return findEmployeeById(id);
}

function patchEmployee(id, fields) {
  const db = getDb();
  const existing = findEmployeeById(id);
  if (!existing) return null;

  const updates = [];
  const values = [];

  if ('allowRemoteAttendance' in fields) {
    updates.push('allow_remote_attendance = ?');
    values.push(fields.allowRemoteAttendance ? 1 : 0);
  }
  if ('workType' in fields) {
    updates.push('work_type = ?');
    values.push(fields.workType);
  }
  if ('appRole' in fields) {
    updates.push('app_role = ?');
    values.push(fields.appRole);
  }
  if ('salaryPolicyGroupId' in fields) {
    updates.push('salary_policy_group_id = ?');
    values.push(fields.salaryPolicyGroupId || null);
  }
  if ('salaryStructureGroupId' in fields) {
    updates.push('salary_structure_group_id = ?');
    values.push(fields.salaryStructureGroupId || null);
  }
  if (updates.length === 0) return existing;

  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`UPDATE employees SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return findEmployeeById(id);
}

function deleteEmployee(id) {
  const res = getDb().prepare('DELETE FROM employees WHERE id = ?').run(id);
  return res.changes > 0;
}

function employeesSummary() {
  const db = getDb();
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS inactive
    FROM employees
  `).get();

  const departments = db.prepare(`
    SELECT department, COUNT(*) AS count
    FROM employees
    GROUP BY department
    ORDER BY count DESC, department ASC
  `).all();

  return {
    total: Number(totals.total || 0),
    active: Number(totals.active || 0),
    inactive: Number(totals.inactive || 0),
    byDepartment: departments.map((item) => ({
      department: item.department,
      count: Number(item.count || 0),
    })),
  };
}

module.exports = {
  listEmployees,
  findEmployeeById,
  createEmployee,
  updateEmployee,
  patchEmployee,
  deleteEmployee,
  employeesSummary,
  getNextEmpCode,
};
