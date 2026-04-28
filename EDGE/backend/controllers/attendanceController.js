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

module.exports = {
  listAttendanceHandler,
  dailySummaryHandler,
  memberHistoryHandler,
  createEventHandler,
  createBatchHandler,
  apkSyncHandler,
};
