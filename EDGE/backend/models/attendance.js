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
  const existing = db
    .prepare('SELECT * FROM attendance_records WHERE member_id = ? AND date = ?')
    .get(memberId, date);

  // Previously this silently called upsertCheckIn() first, which for someone
  // with no record yet stamped check_in AND check_out to the same instant —
  // a nonsensical "0 hours, checked in and out simultaneously" record with no
  // warning. Refuse instead: check-out only makes sense once a check-in
  // exists (from this same manual flow, machine import, or the APK).
  if (!existing || !existing.check_in) {
    const err = new Error('No check-in recorded for this employee today — check in first.');
    err.statusCode = 400;
    throw err;
  }

  const checkOut = nowTime();
  const hoursWorked = deriveHoursWorked(existing.check_in, checkOut);

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
  // Only meaningful for status='leave' — 'paid' or 'unpaid'. Cleared back to
  // null whenever a row is written with a non-leave status, so a stale leave
  // type can't linger if the same day later gets a real punch.
  const leaveType = status === 'leave'
    ? (payload.leaveType ?? payload.leave_type ?? existing?.leave_type ?? null)
    : null;

  if (!existing) {
    const eventId = payload.eventId || `EVT-${randomUUID().slice(0, 8).toUpperCase()}`;
    db.prepare(
      `
      INSERT INTO attendance_records (
        event_id, member_id, date, check_in, check_out, status, hours_worked, face_match, leave_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      leaveType,
    );

    return db.prepare('SELECT * FROM attendance_records WHERE event_id = ?').get(eventId);
  }

  db.prepare(
    `
    UPDATE attendance_records
    SET check_in = ?, check_out = ?, status = ?, hours_worked = ?, face_match = ?, leave_type = ?, updated_at = CURRENT_TIMESTAMP
    WHERE member_id = ? AND date = ?
    `,
  ).run(
    checkIn,
    checkOut,
    status,
    Number(hoursWorked || 0),
    Number(faceMatch || 0),
    leaveType,
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

// Loss-of-Pay days for payroll. Now that working_hours.weekly_off_days
// records WHICH weekday(s) are off (not just a count), a day with no
// attendance_records row at all can safely be treated as a genuine no-show —
// as long as it isn't a weekly off or a holiday, which are excluded outright
// regardless of whether a row exists. A day that DOES have a row only counts
// if it's explicitly 'absent' or 'leave'+unpaid — a real punch or paid leave
// never counts, obviously.
function getLopDaysCount(memberId, fromDate, toDate) {
  const db = getDb();

  const whRow = db.prepare('SELECT weekly_off_days FROM working_hours WHERE id = 1').get();
  let weeklyOffDays = [0, 6];
  try { weeklyOffDays = JSON.parse(whRow?.weekly_off_days || '[0,6]'); } catch { /* keep default */ }
  const offSet = new Set(weeklyOffDays);

  const holidayDates = new Set(
    db.prepare('SELECT date FROM holidays WHERE date BETWEEN ? AND ?').all(fromDate, toDate).map((h) => h.date),
  );

  const monthRecords = db.prepare(
    'SELECT date, status, leave_type FROM attendance_records WHERE member_id = ? AND date BETWEEN ? AND ?',
  ).all(memberId, fromDate, toDate);

  // Safety guard: with zero attendance data for this employee in this range —
  // e.g. payroll run for a month before the company started using EDGEFOLIO,
  // or before this employee's first import — treating every working day as a
  // no-show would zero out their entire pay. Silently doing that on a data
  // gap would be a severe, easy-to-trigger bug. No coverage at all means "we
  // don't know," not "assume the worst" — skip LOP entirely for this range.
  if (monthRecords.length === 0) return 0;

  const recordByDate = {};
  monthRecords.forEach((r) => { recordByDate[r.date] = r; });

  let lopDays = 0;
  const cursor = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  while (cursor <= end) {
    const dateStr = cursor.toISOString().split('T')[0];
    if (!offSet.has(cursor.getDay()) && !holidayDates.has(dateStr)) {
      const rec = recordByDate[dateStr];
      if (!rec) {
        lopDays += 1; // no punch, no leave marked, a working day, not a holiday — genuine no-show
      } else if (rec.status === 'absent' || (rec.status === 'leave' && rec.leave_type === 'unpaid')) {
        lopDays += 1;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return lopDays;
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
  getLopDaysCount,
};
