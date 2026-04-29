const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');

function listShifts() {
  return getDb().prepare('SELECT * FROM shifts ORDER BY start_time').all();
}

function createShift(payload) {
  const db = getDb();
  const shiftId = payload.shiftId || `SHIFT-${randomUUID().slice(0, 8).toUpperCase()}`;
  const isOvernight = String(payload.endTime) < String(payload.startTime) ? 1 : 0;
  db.prepare(`
    INSERT INTO shifts (shift_id, shift_name, start_time, end_time, break_duration, is_overnight, grace_minutes, employees)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    shiftId,
    String(payload.shiftName).trim(),
    payload.startTime,
    payload.endTime,
    Number(payload.breakDuration ?? 60),
    isOvernight,
    Number(payload.graceMinutes ?? 10),
    Number(payload.employees ?? 0),
  );
  return db.prepare('SELECT * FROM shifts WHERE shift_id = ?').get(shiftId);
}

function updateShift(shiftId, payload) {
  const db = getDb();
  const isOvernight = String(payload.endTime) < String(payload.startTime) ? 1 : 0;
  db.prepare(`
    UPDATE shifts SET shift_name = ?, start_time = ?, end_time = ?, break_duration = ?,
    is_overnight = ?, grace_minutes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE shift_id = ?
  `).run(
    String(payload.shiftName).trim(),
    payload.startTime,
    payload.endTime,
    Number(payload.breakDuration ?? 60),
    isOvernight,
    Number(payload.graceMinutes ?? 10),
    shiftId,
  );
  return db.prepare('SELECT * FROM shifts WHERE shift_id = ?').get(shiftId);
}

function deleteShift(shiftId) {
  const res = getDb().prepare('DELETE FROM shifts WHERE shift_id = ?').run(shiftId);
  return res.changes > 0;
}

module.exports = { listShifts, createShift, updateShift, deleteShift };
