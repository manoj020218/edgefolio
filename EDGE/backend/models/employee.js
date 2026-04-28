const { getDb } = require('../config/database');

function listEmployees() {
  const db = getDb();
  return db.prepare('SELECT * FROM employees ORDER BY id').all();
}

function findEmployeeById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
}

function createEmployee(payload) {
  const db = getDb();
  const row = {
    id: payload.id,
    name: payload.name,
    email: payload.email || null,
    phone: payload.phone || null,
    department: payload.department,
    designation: payload.designation || null,
    joining_date: payload.joiningDate || payload.joining_date || null,
    salary: Number(payload.salary || 0),
    status: payload.status || 'active',
    avatar: payload.avatar || null,
  };

  db.prepare(
    `
    INSERT INTO employees (
      id, name, email, phone, department, designation, joining_date, salary, status, avatar
    ) VALUES (
      @id, @name, @email, @phone, @department, @designation, @joining_date, @salary, @status, @avatar
    )
    `,
  ).run(row);
  return findEmployeeById(row.id);
}

function updateEmployee(id, payload) {
  const db = getDb();
  const existing = findEmployeeById(id);
  if (!existing) return null;

  const next = {
    id: existing.id,
    name: payload.name ?? existing.name,
    email: payload.email ?? existing.email,
    phone: payload.phone ?? existing.phone,
    department: payload.department ?? existing.department,
    designation: payload.designation ?? existing.designation,
    joining_date: payload.joiningDate ?? payload.joining_date ?? existing.joining_date,
    salary: Number(payload.salary ?? existing.salary ?? 0),
    status: payload.status ?? existing.status,
    avatar: payload.avatar ?? existing.avatar,
    allow_remote_attendance: payload.allowRemoteAttendance != null
      ? (payload.allowRemoteAttendance ? 1 : 0)
      : (existing.allow_remote_attendance ?? 0),
    updated_at: new Date().toISOString(),
  };

  db.prepare(
    `UPDATE employees
     SET name=@name, email=@email, phone=@phone, department=@department,
         designation=@designation, joining_date=@joining_date, salary=@salary,
         status=@status, avatar=@avatar, allow_remote_attendance=@allow_remote_attendance,
         updated_at=@updated_at
     WHERE id=@id`,
  ).run(next);

  return findEmployeeById(id);
}

function patchEmployee(id, fields) {
  const db = getDb();
  const existing = findEmployeeById(id);
  if (!existing) return null;

  const allowed = ['allow_remote_attendance'];
  const updates = [];
  const values = [];

  if ('allowRemoteAttendance' in fields) {
    updates.push('allow_remote_attendance = ?');
    values.push(fields.allowRemoteAttendance ? 1 : 0);
  }
  if (updates.length === 0) return existing;

  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`UPDATE employees SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return findEmployeeById(id);
}

function deleteEmployee(id) {
  const db = getDb();
  const res = db.prepare('DELETE FROM employees WHERE id = ?').run(id);
  return res.changes > 0;
}

function employeesSummary() {
  const db = getDb();
  const totals = db
    .prepare(
      `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS inactive
      FROM employees
      `,
    )
    .get();

  const departments = db
    .prepare(
      `
      SELECT department, COUNT(*) AS count
      FROM employees
      GROUP BY department
      ORDER BY count DESC, department ASC
      `,
    )
    .all();

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
};
