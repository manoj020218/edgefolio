const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');
const { nowTime, toISODate } = require('../utils/dateUtils');

function listAttendanceByDate(date) {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT a.*, e.name AS employeeName, e.department AS department
      FROM attendance_records a
      LEFT JOIN employees e ON e.id = a.member_id
      WHERE a.date = ?
      ORDER BY a.member_id
      `,
    )
    .all(date);
}

function listAttendanceByMember(memberId, fromDate, toDate) {
  const db = getDb();
  const from = fromDate || '1900-01-01';
  const to = toDate || '2999-12-31';
  return db
    .prepare(
      `
      SELECT a.*, e.name AS employeeName, e.department AS department
      FROM attendance_records a
      LEFT JOIN employees e ON e.id = a.member_id
      WHERE a.member_id = ? AND a.date BETWEEN ? AND ?
      ORDER BY a.date DESC
      `,
    )
    .all(memberId, from, to);
}

function listAttendanceByRange(fromDate, toDate, department) {
  const db = getDb();
  const from = fromDate || '1900-01-01';
  const to = toDate || '2999-12-31';
  if (!department) {
    return db
      .prepare(
        `
        SELECT a.*, e.name AS employeeName, e.department AS department
        FROM attendance_records a
        LEFT JOIN employees e ON e.id = a.member_id
        WHERE a.date BETWEEN ? AND ?
        ORDER BY a.date DESC, a.member_id
        `,
      )
      .all(from, to);
  }
  return db
    .prepare(
      `
      SELECT a.*, e.name AS employeeName, e.department AS department
      FROM attendance_records a
      LEFT JOIN employees e ON e.id = a.member_id
      WHERE a.date BETWEEN ? AND ? AND e.department = ?
      ORDER BY a.date DESC, a.member_id
      `,
    )
    .all(from, to, department);
}

function attendanceStatsByDate(date) {
  const db = getDb();
  const totals = db
    .prepare(
      `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent,
        SUM(CASE WHEN status = 'leave' THEN 1 ELSE 0 END) AS leave_count
      FROM attendance_records
      WHERE date = ?
      `,
    )
    .get(date);

  const employeeTotal = db.prepare('SELECT COUNT(*) AS total FROM employees').get().total;
  const present = Number(totals.present || 0);

  return {
    total: employeeTotal,
    present,
    absent: Number(totals.absent || 0),
    leave: Number(totals.leave_count || 0),
    percentage: employeeTotal ? Math.round((present / employeeTotal) * 100) : 0,
  };
}

function toMins(timeValue) {
  if (!timeValue) return null;
  const [h, m] = String(timeValue).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function deriveHoursWorked(checkIn, checkOut) {
  const inMins = toMins(checkIn);
  const outMins = toMins(checkOut);
  if (inMins === null || outMins === null) return 0;
  return Number(Math.max((outMins - inMins) / 60, 0).toFixed(2));
}

function upsertCheckIn(memberId, date = toISODate()) {
  const db = getDb();
  const existing = db
    .prepare('SELECT * FROM attendance_records WHERE member_id = ? AND date = ?')
    .get(memberId, date);

  if (!existing) {
    const eventId = `EVT-${randomUUID().slice(0, 8).toUpperCase()}`;
    db.prepare(
      `
      INSERT INTO attendance_records (
        event_id, member_id, date, check_in, check_out, status, hours_worked, face_match
      ) VALUES (?, ?, ?, ?, NULL, 'present', 0, 98)
      `,
    ).run(eventId, memberId, date, nowTime());
    return db.prepare('SELECT * FROM attendance_records WHERE event_id = ?').get(eventId);
  }

  db.prepare(
    `
    UPDATE attendance_records
    SET check_in = COALESCE(check_in, ?), status = 'present', updated_at = CURRENT_TIMESTAMP
    WHERE member_id = ? AND date = ?
    `,
  ).run(nowTime(), memberId, date);
  return db
    .prepare('SELECT * FROM attendance_records WHERE member_id = ? AND date = ?')
    .get(memberId, date);
}

function upsertCheckOut(memberId, date = toISODate()) {
  const db = getDb();
  upsertCheckIn(memberId, date);

  const current = db
    .prepare('SELECT * FROM attendance_records WHERE member_id = ? AND date = ?')
    .get(memberId, date);

  const checkOut = nowTime();
  const hoursWorked = deriveHoursWorked(current.check_in, checkOut);

  db.prepare(
    `
    UPDATE attendance_records
    SET check_out = ?, hours_worked = ?, status = 'present', updated_at = CURRENT_TIMESTAMP
    WHERE member_id = ? AND date = ?
    `,
  ).run(checkOut, hoursWorked, memberId, date);

  return db
    .prepare('SELECT * FROM attendance_records WHERE member_id = ? AND date = ?')
    .get(memberId, date);
}

function upsertAttendanceEvent(payload) {
  const db = getDb();
  const memberId = payload.memberId;
  const date = payload.date || toISODate();
  const existing = db
    .prepare('SELECT * FROM attendance_records WHERE member_id = ? AND date = ?')
    .get(memberId, date);

  const checkIn = payload.checkIn ?? payload.check_in ?? existing?.check_in ?? null;
  const checkOut = payload.checkOut ?? payload.check_out ?? existing?.check_out ?? null;
  const hoursWorked =
    payload.hoursWorked ?? payload.hours_worked ?? deriveHoursWorked(checkIn, checkOut);
  const status =
    payload.status || (checkIn || checkOut ? 'present' : existing?.status || 'absent');
  const faceMatch = payload.faceMatch ?? payload.face_match ?? existing?.face_match ?? 0;

  if (!existing) {
    const eventId = payload.eventId || `EVT-${randomUUID().slice(0, 8).toUpperCase()}`;
    db.prepare(
      `
      INSERT INTO attendance_records (
        event_id, member_id, date, check_in, check_out, status, hours_worked, face_match
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      eventId,
      memberId,
      date,
      checkIn,
      checkOut,
      status,
      Number(hoursWorked || 0),
      Number(faceMatch || 0),
    );

    return db.prepare('SELECT * FROM attendance_records WHERE event_id = ?').get(eventId);
  }

  db.prepare(
    `
    UPDATE attendance_records
    SET check_in = ?, check_out = ?, status = ?, hours_worked = ?, face_match = ?, updated_at = CURRENT_TIMESTAMP
    WHERE member_id = ? AND date = ?
    `,
  ).run(
    checkIn,
    checkOut,
    status,
    Number(hoursWorked || 0),
    Number(faceMatch || 0),
    memberId,
    date,
  );

  return db
    .prepare('SELECT * FROM attendance_records WHERE member_id = ? AND date = ?')
    .get(memberId, date);
}

function insertAttendanceBatch(events = []) {
  const db = getDb();
  const tx = db.transaction((rows) => rows.map((row) => upsertAttendanceEvent(row)));
  return tx(events);
}

module.exports = {
  listAttendanceByDate,
  listAttendanceByMember,
  listAttendanceByRange,
  attendanceStatsByDate,
  upsertCheckIn,
  upsertCheckOut,
  upsertAttendanceEvent,
  insertAttendanceBatch,
};
