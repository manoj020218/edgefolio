const {
  getDailyAttendance,
  getDailyAttendanceSummary,
  getMemberAttendanceHistory,
  submitAttendanceEvent,
  submitAttendanceBatch,
} = require('../services/attendanceService');
const { sendOk } = require('../utils/http');
const { serializeAttendance } = require('../utils/serializers');

function listAttendanceHandler(req, res) {
  const rows = getDailyAttendance(req.query.date).map(serializeAttendance);
  sendOk(res, rows, { count: rows.length, date: req.query.date || null });
}

function dailySummaryHandler(req, res) {
  sendOk(res, getDailyAttendanceSummary(req.query.date));
}

function memberHistoryHandler(req, res) {
  const rows = getMemberAttendanceHistory(
    req.params.id,
    req.query.from,
    req.query.to,
  ).map(serializeAttendance);
  sendOk(res, rows, { count: rows.length });
}

function createEventHandler(req, res, next) {
  try {
    const row = serializeAttendance(submitAttendanceEvent(req.body || {}));
    res.status(201);
    return sendOk(res, row);
  } catch (error) {
    return next(error);
  }
}

function createBatchHandler(req, res, next) {
  try {
    const rows = submitAttendanceBatch(req.body?.events || []).map(serializeAttendance);
    res.status(201);
    return sendOk(res, rows, { count: rows.length });
  } catch (error) {
    return next(error);
  }
}

function apkSyncHandler(req, res, next) {
  try {
    const records = req.body?.records || [];
    if (!Array.isArray(records)) {
      const err = new Error('records must be an array');
      err.statusCode = 400;
      throw err;
    }

    const events = records.map((r) => ({
      memberId: r.empId,
      date: r.timestamp ? r.timestamp.slice(0, 10) : null,
      checkIn: r.timestamp ? r.timestamp.slice(11, 16) : null,
      status: 'present',
      faceMatch: Number(r.similarity ?? r.confidence ?? 0) * (r.similarity <= 1 ? 100 : 1),
      location_json: r.location ? JSON.stringify(r.location) : null,
      attendance_mode: r.attendanceMode || 'office',
      device_id: r.deviceId || null,
      apk_source: 1,
    }));

    const rows = submitAttendanceBatch(events).map(serializeAttendance);
    return sendOk(res, rows, { synced: rows.length });
  } catch (error) {
    return next(error);
  }
}

// Handles "2024-04-28 08:55" combined datetime in any field
function normalizeImportRecord(r) {
  let { memberId, date, checkIn, checkOut } = r;
  // datetime in date column (ZK Teco DAT: "2024-04-28 08:55:36")
  if (date && /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(date)) {
    const [d, t] = date.split(' ');
    date   = d;
    if (!checkIn) checkIn = t.slice(0, 5);
  }
  // datetime in checkIn column
  if (checkIn && /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(checkIn)) {
    const [d, t] = checkIn.split(' ');
    if (!date) date = d;
    checkIn = t.slice(0, 5);
  }
  // Trim seconds if present ("08:55:36" → "08:55")
  if (checkIn  && checkIn.length > 5)  checkIn  = checkIn.slice(0, 5);
  if (checkOut && checkOut.length > 5) checkOut = checkOut.slice(0, 5);
  return { memberId, date, checkIn, checkOut };
}

function importHandler(req, res, next) {
  try {
    const records = req.body?.records;
    if (!Array.isArray(records) || records.length === 0) {
      throw { statusCode: 400, message: 'records array is required' };
    }
    const events = records
      .map(normalizeImportRecord)
      .filter((r) => r.memberId && r.date)
      .map((r) => ({
        memberId:        r.memberId,
        date:            r.date,
        checkIn:         r.checkIn  || null,
        checkOut:        r.checkOut || null,
        status:          'present',
        faceMatch:       0,
        attendance_mode: 'machine',
        device_id:       r.deviceId || 'machine-import',
        apk_source:      0,
      }));
    const rows = submitAttendanceBatch(events).map(serializeAttendance);
    return sendOk(res, rows, { imported: rows.length });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listAttendanceHandler,
  dailySummaryHandler,
  memberHistoryHandler,
  createEventHandler,
  createBatchHandler,
  apkSyncHandler,
  importHandler,
};
