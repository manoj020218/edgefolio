const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');

function listDeductions() {
  return getDb().prepare('SELECT * FROM deductions ORDER BY name').all();
}

function createDeduction({ name, percentage, type = 'percentage' }) {
  const db = getDb();
  const id = `DED-${randomUUID().slice(0, 8).toUpperCase()}`;
  db.prepare(
    'INSERT INTO deductions (deduction_id, name, percentage, type) VALUES (?, ?, ?, ?)',
  ).run(id, String(name).trim(), Number(percentage), type);
  return db.prepare('SELECT * FROM deductions WHERE deduction_id = ?').get(id);
}

function updateDeduction(deductionId, { name, percentage, type }) {
  const db = getDb();
  db.prepare(
    `UPDATE deductions SET name = ?, percentage = ?, type = ?, updated_at = CURRENT_TIMESTAMP
     WHERE deduction_id = ?`,
  ).run(String(name).trim(), Number(percentage), type, deductionId);
  return db.prepare('SELECT * FROM deductions WHERE deduction_id = ?').get(deductionId);
}

function deleteDeduction(deductionId) {
  const res = getDb().prepare('DELETE FROM deductions WHERE deduction_id = ?').run(deductionId);
  return res.changes > 0;
}

module.exports = { listDeductions, createDeduction, updateDeduction, deleteDeduction };
