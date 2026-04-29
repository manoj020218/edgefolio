const {
  listAttendanceByDate,
  listAttendanceByMember,
  attendanceStatsByDate,
  upsertCheckIn,
  upsertCheckOut,
  upsertAttendanceEvent,
  insertAttendanceBatch,
} = require('../models/attendance');
const { toISODate } = require('../utils/dateUtils');

function getDailyAttendance(date) {
  const targetDate = date || toISODate();
  return listAttendanceByDate(targetDate);
}

function getDailyAttendanceSummary(date) {
  const targetDate = date || toISODate();
  return attendanceStatsByDate(targetDate);
}

function getMemberAttendanceHistory(memberId, fromDate, toDate) {
  return listAttendanceByMember(memberId, fromDate, toDate);
}

function submitAttendanceEvent(payload) {
  if (!payload?.memberId) {
    const err = new Error('memberId is required');
    err.statusCode = 400;
    throw err;
  }

  const eventType = String(payload.eventType || '').toUpperCase();
  const date = payload.date || toISODate();
  if (eventType === 'CHECK_IN') {
    return upsertCheckIn(payload.memberId, date);
  }
  if (eventType === 'CHECK_OUT') {
    return upsertCheckOut(payload.memberId, date);
  }
  return upsertAttendanceEvent(payload);
}

function submitAttendanceBatch(events = []) {
  if (!Array.isArray(events)) {
    const err = new Error('events must be an array');
    err.statusCode = 400;
    throw err;
  }
  return insertAttendanceBatch(events);
}

module.exports = {
  getDailyAttendance,
  getDailyAttendanceSummary,
  getMemberAttendanceHistory,
  submitAttendanceEvent,
  submitAttendanceBatch,
};
