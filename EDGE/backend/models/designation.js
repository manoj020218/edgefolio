const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');

function listDesignations() {
  return getDb().prepare('SELECT * FROM designations ORDER BY name').all();
}

function createDesignation({ name, description = '' }) {
  const db = getDb();
  const id = `DESIG-${randomUUID().slice(0, 8).toUpperCase()}`;
  db.prepare(
    'INSERT INTO designations (designation_id, name, description) VALUES (?, ?, ?)',
  ).run(id, String(name).trim(), String(description).trim());
  return db.prepare('SELECT * FROM designations WHERE designation_id = ?').get(id);
}

function updateDesignation(designationId, { name, description }) {
  const db = getDb();
  db.prepare(
    `UPDATE designations SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP
     WHERE designation_id = ?`,
  ).run(String(name).trim(), String(description ?? '').trim(), designationId);
  return db.prepare('SELECT * FROM designations WHERE designation_id = ?').get(designationId);
}

function deleteDesignation(designationId) {
  const activeCount = getDb()
    .prepare("SELECT COUNT(*) AS n FROM employees WHERE designation = (SELECT name FROM designations WHERE designation_id = ?) AND status = 'active'")
    .get(designationId)?.n ?? 0;
  if (activeCount > 0) {
    const err = new Error(`Cannot delete: ${activeCount} active employee(s) hold this designation`);
    err.statusCode = 409;
    throw err;
  }
  const res = getDb().prepare('DELETE FROM designations WHERE designation_id = ?').run(designationId);
  return res.changes > 0;
}

module.exports = { listDesignations, createDesignation, updateDesignation, deleteDesignation };
