'use strict';
const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');

function listEarnings() {
  return getDb().prepare('SELECT * FROM earnings_config ORDER BY created_at ASC').all();
}

function createEarning(payload) {
  const db = getDb();
  const id = `EAR-${randomUUID().slice(0, 8).toUpperCase()}`;
  db.prepare(`
    INSERT INTO earnings_config (earning_id, name, percentage, type, is_active)
    VALUES (?, ?, ?, ?, 1)
  `).run(id, payload.name.trim(), Number(payload.percentage || 0), payload.type || 'fixed');
  return db.prepare('SELECT * FROM earnings_config WHERE earning_id = ?').get(id);
}

function updateEarning(id, payload) {
  const db = getDb();
  db.prepare(`
    UPDATE earnings_config
    SET name=?, percentage=?, type=?, updated_at=CURRENT_TIMESTAMP
    WHERE earning_id=?
  `).run(payload.name.trim(), Number(payload.percentage || 0), payload.type || 'fixed', id);
  return db.prepare('SELECT * FROM earnings_config WHERE earning_id = ?').get(id);
}

function deleteEarning(id) {
  return getDb().prepare('DELETE FROM earnings_config WHERE earning_id = ?').run(id).changes > 0;
}

module.exports = { listEarnings, createEarning, updateEarning, deleteEarning };
