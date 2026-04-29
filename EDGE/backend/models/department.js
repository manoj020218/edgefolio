const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');

function listDepartments() {
  return getDb().prepare('SELECT * FROM departments ORDER BY name').all();
}

function createDepartment({ name, description = '' }) {
  const db = getDb();
  const id = `DEPT-${randomUUID().slice(0, 8).toUpperCase()}`;
  db.prepare(
    'INSERT INTO departments (dept_id, name, description) VALUES (?, ?, ?)',
  ).run(id, String(name).trim(), String(description).trim());
  return db.prepare('SELECT * FROM departments WHERE dept_id = ?').get(id);
}

function updateDepartment(deptId, { name, description }) {
  const db = getDb();
  db.prepare(
    `UPDATE departments SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP
     WHERE dept_id = ?`,
  ).run(String(name).trim(), String(description ?? '').trim(), deptId);
  return db.prepare('SELECT * FROM departments WHERE dept_id = ?').get(deptId);
}

function deleteDepartment(deptId) {
  const activeCount = getDb()
    .prepare("SELECT COUNT(*) AS n FROM employees WHERE department = (SELECT name FROM departments WHERE dept_id = ?) AND status = 'active'")
    .get(deptId)?.n ?? 0;
  if (activeCount > 0) {
    const err = new Error(`Cannot delete: ${activeCount} active employee(s) in this department`);
    err.statusCode = 409;
    throw err;
  }
  const res = getDb().prepare('DELETE FROM departments WHERE dept_id = ?').run(deptId);
  return res.changes > 0;
}

module.exports = { listDepartments, createDepartment, updateDepartment, deleteDepartment };
