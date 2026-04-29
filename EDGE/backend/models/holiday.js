const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');

function listHolidays(year) {
  const db = getDb();
  if (year) {
    return db.prepare("SELECT * FROM holidays WHERE date LIKE ? ORDER BY date").all(`${year}-%`);
  }
  return db.prepare('SELECT * FROM holidays ORDER BY date').all();
}

function createHoliday({ date, name, type = 'custom' }) {
  const db = getDb();
  const id = `HOL-${randomUUID().slice(0, 8).toUpperCase()}`;
  db.prepare(
    'INSERT INTO holidays (holiday_id, date, name, type) VALUES (?, ?, ?, ?)',
  ).run(id, date, String(name).trim(), type);
  return db.prepare('SELECT * FROM holidays WHERE holiday_id = ?').get(id);
}

function updateHoliday(holidayId, { date, name, type }) {
  const db = getDb();
  db.prepare(
    `UPDATE holidays SET date = ?, name = ?, type = ?, updated_at = CURRENT_TIMESTAMP
     WHERE holiday_id = ?`,
  ).run(date, String(name).trim(), type, holidayId);
  return db.prepare('SELECT * FROM holidays WHERE holiday_id = ?').get(holidayId);
}

function deleteHoliday(holidayId) {
  const res = getDb().prepare('DELETE FROM holidays WHERE holiday_id = ?').run(holidayId);
  return res.changes > 0;
}

module.exports = { listHolidays, createHoliday, updateHoliday, deleteHoliday };
