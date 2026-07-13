'use strict';
/**
 * m68Service.js — LAN HTTP listener for WitEasy M68 / FK BS-protocol devices.
 *
 * The M68 machine is the HTTP CLIENT. It POSTs to our listener on every poll cycle
 * (every 5-20 s). We must therefore listen on a LAN-reachable address.
 *
 * Env vars:
 *   EDGE_M68_PORT  — listener port (default 5005)
 *   EDGE_M68_BIND  — bind address (default 0.0.0.0)
 *
 * Architecture:
 *   - Pure node http server (no express dependency) on its own port
 *   - Shares the process with the main express app (started from backend/index.js)
 *   - All request handlers are wrapped in try/catch (STAB-01)
 *   - Unknown dev_id → logged (throttled) and answered with error response
 *   - Punches land in machine_import_staging (source 'm68')
 *   - Auto-commit for mapped users UNLESS license state is 'readonly'
 */

const http = require('http');
const { getDb } = require('../config/database');
const { getLicenseState } = require('./licenseService');
const {
  parseRequest,
  parseGLogRecords,
  parseRealtimeGLog,
  parseGetLogDataResult,
  parseGetUserIdListResult,
  buildReceiveCmdResponse,
  buildSimpleResponse,
  sendResponse,
  fkTime14,
  ioModeToDirection,
} = require('./m68Protocol');
const { stageRecords, commitMappedRecords } = require('../models/machineImportModel');

const logger = require('../utils/logger');

const M68_PORT = parseInt(process.env.EDGE_M68_PORT || '5005', 10);
const M68_BIND = process.env.EDGE_M68_BIND || '0.0.0.0';

// ── Runtime state ─────────────────────────────────────────────────────────────
let _server = null;
let _started = false;

// In-memory block reassembly buffers: dev_id → { lastBlkNo, chunks: Buffer[] }
const _blockBuffers = new Map();

// Throttle "unregistered device" event log: dev_id → last logged timestamp
const _unregThrottle = new Map();
const UNREG_THROTTLE_MS = 60_000; // log at most once per minute per unknown dev_id

// ── DB helpers ─────────────────────────────────────────────────────────────────

function getDevice(devId) {
  try {
    return getDb().prepare('SELECT * FROM m68_devices WHERE dev_id = ?').get(devId);
  } catch { return null; }
}

/**
 * Update last_seen_at for the device.
 * Returns true if this was the first contact (last_seen_at was NULL before).
 */
function updateLastSeen(devId, requestCode) {
  try {
    const db = getDb();
    const prev = db.prepare('SELECT last_seen_at FROM m68_devices WHERE dev_id = ?').get(devId);
    const isFirstContact = !prev || !prev.last_seen_at;
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE m68_devices
      SET last_seen_at = ?, last_request_code = ?, updated_at = ?
      WHERE dev_id = ?
    `).run(now, requestCode, now, devId);
    return isFirstContact;
  } catch { return false; }
}

function logEvent(devId, kind, payloadB64) {
  try {
    getDb().prepare(`
      INSERT INTO m68_events (dev_id, kind, payload_b64, received_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(devId, kind, payloadB64 || null);
  } catch {}
}

function popPendingCommand(devId) {
  const db = getDb();
  try {
    const row = db.prepare(`
      SELECT * FROM m68_commands
      WHERE dev_id = ? AND status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
    `).get(devId);
    if (!row) return null;
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE m68_commands SET status = 'sent', sent_at = ? WHERE id = ?
    `).run(now, row.id);
    return row;
  } catch { return null; }
}

function markCommandDone(transId, resultSummary) {
  try {
    const now = new Date().toISOString();
    getDb().prepare(`
      UPDATE m68_commands
      SET status = 'done', result_summary = ?, completed_at = ?
      WHERE trans_id = ?
    `).run(resultSummary || null, now, transId);
  } catch {}
}

// ── Block reassembly ──────────────────────────────────────────────────────────

function saveBlockChunk(devId, blkNo, chunk) {
  if (!_blockBuffers.has(devId) || blkNo === 1) {
    _blockBuffers.set(devId, { lastBlkNo: 1, chunks: [chunk] });
    return;
  }
  const state = _blockBuffers.get(devId);
  if (blkNo !== state.lastBlkNo + 1) {
    // Out-of-order block — reset
    _blockBuffers.delete(devId);
    if (blkNo === 1) _blockBuffers.set(devId, { lastBlkNo: 1, chunks: [chunk] });
    return;
  }
  state.chunks.push(chunk);
  state.lastBlkNo = blkNo;
}

function getAndClearBlockBuffer(devId, finalChunk) {
  const state = _blockBuffers.get(devId);
  _blockBuffers.delete(devId);
  if (!state) return finalChunk;
  return Buffer.concat([...state.chunks, finalChunk]);
}

// ── Staging + commit ──────────────────────────────────────────────────────────

/**
 * Stage a single real-time punch.
 * Uses INSERT OR IGNORE semantics via the unique index idx_m68_staging_dedup.
 */
function stageGLogPunch(devId, punch) {
  try {
    const batchId = `m68_rt_${devId}_${Date.now()}`;
    const record = {
      recordType:   'punch',
      machineEmpId: String(punch.userId),
      machineName:  devId,
      punchDate:    punch.punchDate,
      punchTime:    punch.punchTime,
      direction:    ioModeToDirection(punch.ioMode),
      mode:         `ioMode:${punch.ioMode}|verify:${punch.verifyMode}`,
    };
    const result = stageRecordsDedup(batchId, 'm68', [record]);
    logger.info('[m68] staged punch', { devId, userId: punch.userId, at: punch.at, batchId, staged: result.staged });

    // Auto-commit if not in readonly mode
    try {
      const licState = getLicenseState();
      if (licState && licState.state === 'readonly') {
        logger.info('[m68] license readonly — skipping auto-commit', { devId });
        return;
      }
    } catch {}

    // Only commit the batch we just staged (avoids touching other pending batches)
    const commitResult = commitMappedRecords(batchId);
    if (commitResult.committed > 0) {
      logger.info('[m68] auto-committed attendance', { devId, ...commitResult });
    }
  } catch (e) {
    logger.info('[m68] stageGLogPunch error', { devId, error: e.message });
  }
}

/**
 * Stage a batch of GLog punches (backfill) with INSERT OR IGNORE dedupe.
 * Returns { staged, skipped, batchId }.
 */
function stageGLogBackfill(devId, punches) {
  if (!punches || punches.length === 0) return { staged: 0, skipped: 0 };
  try {
    const batchId = `m68_bf_${devId}_${Date.now()}`;
    const records = punches.map(p => ({
      recordType:   'punch',
      machineEmpId: String(p.userId),
      machineName:  devId,
      punchDate:    p.punchDate,
      punchTime:    p.punchTime,
      direction:    ioModeToDirection(p.inOut),
      mode:         `inOut:${p.inOut}|verify:${p.verifyMode}`,
    }));

    const result = stageRecordsDedup(batchId, 'm68', records);
    logger.info('[m68] backfill staged', { devId, total: punches.length, staged: result.staged, skipped: result.skipped, batchId });

    // Auto-commit mapped users (respect license readonly)
    try {
      const licState = getLicenseState();
      if (licState && licState.state === 'readonly') {
        logger.info('[m68] license readonly — skipping auto-commit for backfill', { devId });
        return { ...result, batchId };
      }
    } catch {}

    const commitResult = commitMappedRecords(batchId);
    if (commitResult.committed > 0) {
      logger.info('[m68] backfill auto-committed', { devId, ...commitResult });
    }

    return { ...result, batchId, committed: commitResult.committed };
  } catch (e) {
    logger.info('[m68] stageGLogBackfill error', { devId, error: e.message });
    return { staged: 0, skipped: 0 };
  }
}

/**
 * Stage records with INSERT OR IGNORE dedupe using the unique index on
 * (source_type, machine_name, machine_emp_id, punch_date, punch_time) WHERE source_type='m68'.
 *
 * We use INSERT OR IGNORE directly so the DB enforces uniqueness atomically.
 */
function stageRecordsDedup(batchId, sourceType, records) {
  const db = getDb();
  const { commitMappedRecords: _commit } = require('../models/machineImportModel');

  // Load mappings for auto-assign
  const knownMappings = {};
  db.prepare('SELECT machine_emp_id, employee_id FROM machine_id_mappings').all()
    .forEach(m => { knownMappings[m.machine_emp_id] = m.employee_id; });

  const insertOrIgnore = db.prepare(`
    INSERT OR IGNORE INTO machine_import_staging (
      import_batch, source_type, record_type,
      machine_emp_id, machine_name,
      punch_date, punch_time, direction,
      mode, raw_json,
      mapped_employee_id, status
    ) VALUES (
      @importBatch, @sourceType, @recordType,
      @machineEmpId, @machineName,
      @punchDate, @punchTime, @direction,
      @mode, @rawJson,
      @mappedEmployeeId, @status
    )
  `);

  let staged = 0, skipped = 0;
  const tx = db.transaction((rows) => {
    for (const r of rows) {
      const mapped = knownMappings[r.machineEmpId] || null;
      const info = insertOrIgnore.run({
        importBatch:      batchId,
        sourceType,
        recordType:       r.recordType || 'punch',
        machineEmpId:     r.machineEmpId,
        machineName:      r.machineName || null,
        punchDate:        r.punchDate,
        punchTime:        r.punchTime || null,
        direction:        r.direction || null,
        mode:             r.mode || null,
        rawJson:          JSON.stringify(r),
        mappedEmployeeId: mapped,
        status:           mapped ? 'mapped' : 'pending',
      });
      if (info.changes > 0) staged++;
      else skipped++;
    }
  });
  tx(records);

  return { staged, skipped, batchId };
}

/**
 * Save GET_USER_ID_LIST results to m68_device_users (full refresh for the device).
 */
function saveDeviceUsers(devId, users) {
  if (!users || users.length === 0) return 0;
  try {
    const db = getDb();
    const now = new Date().toISOString();
    // Full refresh: delete old entries then insert new
    db.prepare('DELETE FROM m68_device_users WHERE dev_id = ?').run(devId);
    const ins = db.prepare(`
      INSERT OR REPLACE INTO m68_device_users (dev_id, user_id, user_name, privilege, enabled, backup_number, updated_at)
      VALUES (?, ?, NULL, ?, ?, ?, ?)
    `);
    const tx = db.transaction((rows) => {
      for (const u of rows) {
        ins.run(devId, u.userId, u.privilege, u.enabled, u.backupNumber, now);
      }
    });
    tx(users);
    logger.info('[m68] device users saved', { devId, count: users.length });
    return users.length;
  } catch (e) {
    logger.info('[m68] saveDeviceUsers error', { devId, error: e.message });
    return 0;
  }
}

/**
 * Auto-queue GET_USER_ID_LIST once for a device that just had its first contact
 * (i.e., last_seen_at was NULL before this request).
 */
function autoQueueUserIdList(devId) {
  try {
    const { randomUUID } = require('crypto');
    const db = getDb();
    // Check if GET_USER_ID_LIST already exists (pending or done)
    const exists = db.prepare(`
      SELECT 1 FROM m68_commands WHERE dev_id = ? AND cmd_code = 'GET_USER_ID_LIST'
      AND status IN ('pending', 'sent') LIMIT 1
    `).get(devId);
    if (exists) return;

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO m68_commands (dev_id, trans_id, cmd_code, cmd_param, status, created_at)
      VALUES (?, ?, 'GET_USER_ID_LIST', '{}', 'pending', ?)
    `).run(devId, randomUUID(), now);
    logger.info('[m68] auto-queued GET_USER_ID_LIST on first contact', { devId });
  } catch (e) {
    logger.info('[m68] autoQueueUserIdList error', { devId, error: e.message });
  }
}

// ── Request handlers ──────────────────────────────────────────────────────────

function handleReceiveCmd(devId, bodyBuffer, transId, res) {
  // Device is polling for a command
  const cmd = popPendingCommand(devId);
  if (!cmd) {
    // No command waiting — SDK uses "ERROR_NO_CMD" per Default.aspx.cs line 313
    sendResponse(res, buildSimpleResponse('ERROR_NO_CMD', transId));
    return;
  }

  let cmdParam = cmd.cmd_param || '';
  // For SET_TIME: inject current server time
  if (cmd.cmd_code === 'SET_TIME') {
    cmdParam = JSON.stringify({ time: fkTime14(new Date()) });
  }

  logger.info('[m68] dispatching command', { devId, cmdCode: cmd.cmd_code, transId: cmd.trans_id });
  sendResponse(res, buildReceiveCmdResponse(cmd.trans_id, cmd.cmd_code, cmdParam));
}

function handleSendCmdResult(devId, bodyBuffer, transId, res) {
  // Look up which command this result belongs to
  let cmdCode = null;
  try {
    const row = getDb().prepare('SELECT cmd_code FROM m68_commands WHERE trans_id = ?').get(transId);
    cmdCode = row ? row.cmd_code : null;
  } catch {}

  logger.info('[m68] send_cmd_result received', { devId, transId, cmdCode, bytes: bodyBuffer.length });

  let resultSummary = `received ${bodyBuffer.length} bytes`;

  // Dispatch on cmd_code for result parsing
  if (cmdCode === 'GET_LOG_DATA') {
    try {
      const parsed = parseGetLogDataResult(bodyBuffer);
      if (parsed.error) {
        logger.info('[m68] GET_LOG_DATA parse error', { devId, transId, error: parsed.error });
        resultSummary = `parse_error:${parsed.error}`;
      } else {
        const backfill = stageGLogBackfill(devId, parsed.punches);
        resultSummary = `log_count:${parsed.logCount},staged:${backfill.staged},skipped:${backfill.skipped},committed:${backfill.committed || 0}`;
        logger.info('[m68] GET_LOG_DATA backfill complete', { devId, ...backfill, logCount: parsed.logCount });
      }
    } catch (e) {
      logger.info('[m68] GET_LOG_DATA handler error', { devId, transId, error: e.message });
      resultSummary = `handler_error:${e.message}`;
    }
  } else if (cmdCode === 'GET_USER_ID_LIST') {
    try {
      const parsed = parseGetUserIdListResult(bodyBuffer);
      if (parsed.error) {
        logger.info('[m68] GET_USER_ID_LIST parse error', { devId, transId, error: parsed.error });
        resultSummary = `parse_error:${parsed.error}`;
      } else {
        const saved = saveDeviceUsers(devId, parsed.users);
        resultSummary = `user_count:${parsed.userCount},saved:${saved}`;
        logger.info('[m68] GET_USER_ID_LIST complete', { devId, userCount: parsed.userCount, saved });
      }
    } catch (e) {
      logger.info('[m68] GET_USER_ID_LIST handler error', { devId, transId, error: e.message });
      resultSummary = `handler_error:${e.message}`;
    }
  }

  markCommandDone(transId, resultSummary);
  sendResponse(res, buildSimpleResponse('OK', transId));
}

function handleRealtimeGLog(devId, bodyBuffer, res) {
  try {
    const punch = parseRealtimeGLog(bodyBuffer);
    if (!punch || punch.error) {
      logger.info('[m68] realtime_glog parse error', { devId, error: punch && punch.error });
      sendResponse(res, buildSimpleResponse('ERROR_DB_ACCESS'));
      return;
    }
    if (!punch.punchDate) {
      logger.info('[m68] realtime_glog missing date', { devId, ioTime: punch.ioTime });
      sendResponse(res, buildSimpleResponse('ERROR_DB_ACCESS'));
      return;
    }
    stageGLogPunch(devId, punch);
    sendResponse(res, buildSimpleResponse('OK'));
  } catch (e) {
    logger.info('[m68] realtime_glog handler error', { devId, error: e.message });
    sendResponse(res, buildSimpleResponse('ERROR_DB_ACCESS'));
  }
}

function handleRealtimeEvent(devId, kind, bodyBuffer, res) {
  try {
    const b64 = bodyBuffer.length > 0 ? bodyBuffer.toString('base64') : null;
    logEvent(devId, kind, b64);
    logger.info(`[m68] ${kind} received`, { devId, bytes: bodyBuffer.length });
  } catch (e) {
    logger.info(`[m68] ${kind} handler error`, { devId, error: e.message });
  }
  sendResponse(res, buildSimpleResponse('OK'));
}

// ── HTTP request processor ────────────────────────────────────────────────────

function processRequest(req, res) {
  // Collect body
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    try {
      const rawBody = Buffer.concat(chunks);
      const headers = req.headers; // node http already lowercases these

      const parsed = parseRequest(headers, rawBody);

      if (parsed.error) {
        logger.info('[m68] parse error', { error: parsed.error });
        res.writeHead(400);
        res.end('Bad Request');
        return;
      }

      const { devId, requestCode, transId, blkNo, bodyBuffer } = parsed;

      // dev_id allowlist check
      const device = devId ? getDevice(devId) : null;

      if (!device || !device.enabled) {
        const now = Date.now();
        const lastLog = _unregThrottle.get(devId) || 0;
        if (now - lastLog > UNREG_THROTTLE_MS) {
          _unregThrottle.set(devId, now);
          logger.info('[m68] unregistered device seen', { devId });
          // Store an event for UI visibility (once per throttle window)
          logEvent(devId || 'unknown', 'unregistered', null);
        }
        sendResponse(res, buildSimpleResponse('ERROR_DEV_UNREGISTERED', transId));
        return;
      }

      // Update last_seen_at on every valid request; auto-queue user list on first contact
      const firstContact = updateLastSeen(devId, requestCode);
      if (firstContact) {
        autoQueueUserIdList(devId);
      }

      // Block reassembly: blk_no > 0 → accumulate, blk_no = 0 → finalise
      if (blkNo > 0) {
        saveBlockChunk(devId, blkNo, bodyBuffer);
        sendResponse(res, buildSimpleResponse('OK', transId));
        return;
      }

      // blk_no === 0: get full buffer (prior blocks + current)
      const fullBuffer = getAndClearBlockBuffer(devId, bodyBuffer);

      switch (requestCode) {
        case 'receive_cmd':
          handleReceiveCmd(devId, fullBuffer, transId, res);
          break;
        case 'send_cmd_result':
          handleSendCmdResult(devId, fullBuffer, transId, res);
          break;
        case 'realtime_glog':
          handleRealtimeGLog(devId, fullBuffer, res);
          break;
        case 'realtime_enroll_data':
          handleRealtimeEvent(devId, 'enroll', fullBuffer, res);
          break;
        case 'realtime_barcode':
          handleRealtimeEvent(devId, 'barcode', fullBuffer, res);
          break;
        case 'realtime_operation':
          handleRealtimeEvent(devId, 'operation', fullBuffer, res);
          break;
        default:
          logger.info('[m68] unknown request_code', { devId, requestCode });
          sendResponse(res, buildSimpleResponse('ERROR_INVLAID_REQUEST_CODE', transId));
      }
    } catch (e) {
      // STAB-01: never crash the process on a bad request
      logger.info('[m68] unhandled error in request processor', { error: e.message });
      try { res.writeHead(500); res.end(); } catch {}
    }
  });
  req.on('error', (e) => {
    logger.info('[m68] request stream error', { error: e.message });
  });
}

// ── start / stop ──────────────────────────────────────────────────────────────

function start() {
  if (_started) return;

  try {
    _server = http.createServer((req, res) => {
      // Only accept POST (all paths, per the M68 device design)
      if (req.method !== 'POST') {
        res.writeHead(405);
        res.end();
        return;
      }
      processRequest(req, res);
    });

    _server.on('error', (e) => {
      // STAB-01: log but never crash
      logger.info('[m68] listener error', { error: e.message, code: e.code });
    });

    _server.listen(M68_PORT, M68_BIND, () => {
      _started = true;
      logger.info('[m68] listener started', { bind: M68_BIND, port: M68_PORT });
    });
  } catch (e) {
    logger.info('[m68] failed to start listener', { error: e.message });
  }
}

function stop() {
  if (!_server) return;
  try {
    _server.close(() => {
      _started = false;
      logger.info('[m68] listener stopped');
    });
  } catch (e) {
    logger.info('[m68] error stopping listener', { error: e.message });
  }
  _server = null;
}

/**
 * Return current listener state for the /m68/status endpoint.
 * Minimal surface — only what the controller needs.
 */
function getStatus() {
  return {
    running: _started,
    port:    M68_PORT,
    bind:    M68_BIND,
  };
}

module.exports = { start, stop, getStatus };
