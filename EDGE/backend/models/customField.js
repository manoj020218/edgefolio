'use strict';
const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');

function listFields() {
  return getDb()
    .prepare('SELECT * FROM custom_field_definitions ORDER BY display_order, created_at')
    .all();
}

function findField(fieldId) {
  return getDb().prepare('SELECT * FROM custom_field_definitions WHERE field_id = ?').get(fieldId);
}

function createField(payload) {
  const db = getDb();
  const fieldId = `CF-${randomUUID().slice(0, 8).toUpperCase()}`;
  const maxRow = db.prepare('SELECT MAX(display_order) AS n FROM custom_field_definitions').get();
  const order = (maxRow?.n || 0) + 1;
  db.prepare(`
    INSERT INTO custom_field_definitions (field_id, field_name, field_type, is_required, display_order)
    VALUES (?, ?, ?, ?, ?)
  `).run(fieldId, payload.fieldName, payload.fieldType || 'text', payload.isRequired ? 1 : 0, order);
  return findField(fieldId);
}

function updateField(fieldId, payload) {
  const existing = findField(fieldId);
  if (!existing) return null;
  const db = getDb();
  db.prepare(`
    UPDATE custom_field_definitions
    SET field_name=?, field_type=?, is_required=?, display_order=?
    WHERE field_id=?
  `).run(
    payload.fieldName ?? existing.field_name,
    payload.fieldType ?? existing.field_type,
    payload.isRequired != null ? (payload.isRequired ? 1 : 0) : existing.is_required,
    payload.displayOrder ?? existing.display_order,
    fieldId,
  );
  return findField(fieldId);
}

function deleteField(fieldId) {
  return getDb().prepare('DELETE FROM custom_field_definitions WHERE field_id = ?').run(fieldId).changes > 0;
}

function getEmployeeValues(employeeId) {
  return getDb()
    .prepare(`
      SELECT ecv.field_id, cfd.field_name, cfd.field_type, ecv.value
      FROM employee_custom_values ecv
      JOIN custom_field_definitions cfd ON ecv.field_id = cfd.field_id
      WHERE ecv.employee_id = ?
      ORDER BY cfd.display_order
    `)
    .all(employeeId);
}

function setEmployeeValues(employeeId, values) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO employee_custom_values (employee_id, field_id, value, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(employee_id, field_id)
    DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  db.transaction(() => {
    for (const { fieldId, value } of values) {
      stmt.run(employeeId, fieldId, value ?? null);
    }
  })();
  return getEmployeeValues(employeeId);
}

module.exports = {
  listFields,
  createField,
  updateField,
  deleteField,
  getEmployeeValues,
  setEmployeeValues,
};
