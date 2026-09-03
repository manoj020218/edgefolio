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

// ─── Machine import (staging-based, FK-safe) ────────────────────────────────

function machineImportAlogHandler(req, res, next) {
  try {
    const { fileData, batchId } = req.body || {};
    if (!fileData) return next({ statusCode: 400, message: 'fileData (base64) required' });
    const { parseAlogFile } = require('../services/alogService');
    const { stageRecords } = require('../models/machineImportModel');
    const buf = Buffer.from(fileData, 'base64');
    const { records, summary } = parseAlogFile(buf);
    const batch = batchId || `ALOG-${Date.now()}`;
    const result = stageRecords(batch, 'alog', records);
    return sendOk(res, { ...result, parseSummary: summary });
  } catch (error) {
    return next(error);
  }
}

function machineImportJenixHandler(req, res, next) {
  try {
    const { fileData, sheetName, batchId } = req.body || {};
    if (!fileData) return next({ statusCode: 400, message: 'fileData (base64) required' });
    const { processForStaging } = require('../services/jenixService');
    const { stageRecords } = require('../models/machineImportModel');
    const buf = Buffer.from(fileData, 'base64');
    const { records, summary } = processForStaging(buf, { sheetName });
    const batch = batchId || `JENIX-${Date.now()}`;
    const result = stageRecords(batch, 'jenix', records);
    return sendOk(res, { ...result, parseSummary: summary });
  } catch (error) {
    return next(error);
  }
}

function stagingBatchesHandler(req, res, next) {
  try {
    const { listBatches } = require('../models/machineImportModel');
    return sendOk(res, listBatches());
  } catch (error) {
    return next(error);
  }
}

function stagingDeleteBatchHandler(req, res, next) {
  try {
    const { deleteBatch } = require('../models/machineImportModel');
    return sendOk(res, deleteBatch(req.params.batchId));
  } catch (error) {
    return next(error);
  }
}

function stagingUnmappedHandler(req, res, next) {
  try {
    const { listUnmappedIds } = require('../models/machineImportModel');
    return sendOk(res, listUnmappedIds());
  } catch (error) {
    return next(error);
  }
}

function stagingGetMappingsHandler(req, res, next) {
  try {
    const { getMappings } = require('../models/machineImportModel');
    return sendOk(res, getMappings());
  } catch (error) {
    return next(error);
  }
}

function stagingSaveMappingsHandler(req, res, next) {
  try {
    const mappings = req.body?.mappings;
    if (!Array.isArray(mappings) || mappings.length === 0) {
      return next({ statusCode: 400, message: 'mappings array is required: [{machineEmpId, employeeId}]' });
    }
    for (const m of mappings) {
      if (!m.machineEmpId || !m.employeeId) {
        return next({ statusCode: 400, message: 'Each mapping requires machineEmpId and employeeId' });
      }
    }
    const { saveMappings } = require('../models/machineImportModel');
    return sendOk(res, saveMappings(mappings));
  } catch (error) {
    return next(error);
  }
}

function stagingDeleteMappingsHandler(req, res, next) {
  try {
    const ids = req.body?.machineEmpIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      return next({ statusCode: 400, message: 'machineEmpIds array is required' });
    }
    const { deleteMappings } = require('../models/machineImportModel');
    return sendOk(res, deleteMappings(ids));
  } catch (error) {
    return next(error);
  }
}

function stagingCommitHandler(req, res, next) {
  try {
    const { batchId } = req.body || {};
    const { commitMappedRecords } = require('../models/machineImportModel');
    const result = commitMappedRecords(batchId || null);
    return sendOk(res, result);
  } catch (error) {
    return next(error);
  }
}

function stagingSummaryHandler(req, res, next) {
  try {
    const { batchId } = req.query;
    const { getStagingSummary } = require('../models/machineImportModel');
    return sendOk(res, getStagingSummary(batchId || null));
  } catch (error) {
    return next(error);
  }
}

function stagingRecordsHandler(req, res, next) {
  try {
    const { batchId, machineEmpId, employeeId, date, status, page = 1, limit = 200 } = req.query;
    const db = require('../config/database').getDb();
    const conditions = [];
    const params = [];
    if (batchId)      { conditions.push('import_batch = ?');       params.push(batchId); }
    if (machineEmpId) { conditions.push('machine_emp_id = ?');     params.push(machineEmpId); }
    // Raw per-punch detail for one employee (any device/machine ID they're
    // mapped from) — "Detail Punch Record" lookup from the Attendance Register,
    // to see everything that fed into a first-in/last-out check-in/check-out.
    if (employeeId)   { conditions.push('mapped_employee_id = ?'); params.push(employeeId); }
    if (date)         { conditions.push('punch_date = ?');         params.push(date); }
    if (status)       { conditions.push('status = ?');             params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
    const rows = db.prepare(
      `SELECT * FROM machine_import_staging ${where} ORDER BY punch_date, machine_emp_id, punch_time LIMIT ? OFFSET ?`
    ).all(...params, Number(limit), offset);
    const total = db.prepare(
      `SELECT COUNT(*) AS n FROM machine_import_staging ${where}`
    ).get(...params).n;
    return sendOk(res, rows, { total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    return next(error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function getJenixSheetsHandler(req, res, next) {
  try {
    const { fileData } = req.body || {};
    if (!fileData) return next({ statusCode: 400, message: 'fileData (base64) required' });
    const XLSX = require('xlsx');
    const buf = Buffer.from(fileData, 'base64');
    const wb = XLSX.read(buf, { type: 'buffer' });
    return sendOk(res, { sheets: wb.SheetNames });
  } catch (error) {
    return next(error);
  }
}

function parseJenixHandler(req, res, next) {
  try {
    const { fileData, sheetName } = req.body || {};
    if (!fileData) return next({ statusCode: 400, message: 'fileData (base64) required' });
    const { processAttendanceFile } = require('../services/jenixService');
    const buf = Buffer.from(fileData, 'base64');
    const result = processAttendanceFile(buf, { sheetName });
    return sendOk(res, result);
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
  getJenixSheetsHandler,
  parseJenixHandler,
  // machine import (staging-based)
  machineImportAlogHandler,
  machineImportJenixHandler,
  stagingBatchesHandler,
  stagingDeleteBatchHandler,
  stagingUnmappedHandler,
  stagingGetMappingsHandler,
  stagingSaveMappingsHandler,
  stagingDeleteMappingsHandler,
  stagingCommitHandler,
  stagingSummaryHandler,
  stagingRecordsHandler,
};
