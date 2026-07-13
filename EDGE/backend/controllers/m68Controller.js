'use strict';
/**
 * m68Controller.js — REST API handlers for WitEasy M68 device management.
 *
 * Routes (mounted at /m68 behind requireAuth + requireLicense):
 *   GET    /m68/devices                — list devices with per-device stats
 *   POST   /m68/devices                — register a device
 *   PUT    /m68/devices/:id            — update a device
 *   DELETE /m68/devices/:id            — remove a device + pending commands
 *   GET    /m68/devices/:id/users      — device user list with mapping status
 *   GET    /m68/status                 — listener state + device summaries
 *   POST   /m68/command                — queue a command (allowlisted only)
 *   GET    /m68/events?limit=N         — recent m68_events
 */

const os = require('os');
const { randomUUID } = require('crypto');
const { getDb }             = require('../config/database');
const { sendOk, createHttpError } = require('../utils/http');
const m68Service            = require('../services/m68Service');
const { fkTime14 }          = require('../services/m68Protocol');

// Commands we allow via the API — GET_LOG_DATA and GET_DEVICE_STATUS carry no
// extra params; SET_TIME param is injected at delivery time by m68Service.
const ALLOWED_COMMANDS = new Set(['SET_TIME', 'GET_LOG_DATA', 'GET_DEVICE_STATUS', 'GET_USER_ID_LIST']);

// ── helpers ───────────────────────────────────────────────────────────────────

/** Return all LAN IPv4 addresses (non-loopback) for the status hint. */
function getLanIps() {
  try {
    const result = [];
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          result.push(iface.address);
        }
      }
    }
    return result;
  } catch {
    return [];
  }
}

/** Count pending commands for a dev_id. */
function pendingCount(db, devId) {
  try {
    return db.prepare(
      "SELECT COUNT(*) AS n FROM m68_commands WHERE dev_id = ? AND status = 'pending'"
    ).get(devId)?.n || 0;
  } catch { return 0; }
}

/** Get result_summary of last completed GET_LOG_DATA command for a dev_id. */
function lastBackfillSummary(db, devId) {
  try {
    const row = db.prepare(`
      SELECT result_summary, completed_at FROM m68_commands
      WHERE dev_id = ? AND cmd_code = 'GET_LOG_DATA' AND status = 'done'
      ORDER BY completed_at DESC LIMIT 1
    `).get(devId);
    return row ? { summary: row.result_summary, at: row.completed_at } : null;
  } catch { return null; }
}

/** Count enrolled users from m68_device_users for a dev_id. */
function deviceUserCount(db, devId) {
  try {
    return db.prepare('SELECT COUNT(*) AS n FROM m68_device_users WHERE dev_id = ?').get(devId)?.n || 0;
  } catch { return 0; }
}

/** Count staged-but-unmapped punches for a dev_id (source 'm68', status 'pending'). */
function unmappedCount(db, devId) {
  try {
    // machine_name in staging is set to dev_id by m68Service
    return db.prepare(`
      SELECT COUNT(*) AS n
      FROM machine_import_staging
      WHERE source_type = 'm68'
        AND machine_name = ?
        AND status = 'pending'
        AND mapped_employee_id IS NULL
    `).get(devId)?.n || 0;
  } catch { return 0; }
}

/** True if last_seen_at was within the last 120 seconds. */
function isOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  try {
    return (Date.now() - new Date(lastSeenAt).getTime()) < 120_000;
  } catch { return false; }
}

// ── GET /m68/devices ─────────────────────────────────────────────────────────

function listDevicesHandler(req, res, next) {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM m68_devices ORDER BY created_at ASC').all();
    const data = rows.map(d => ({
      id:                d.id,
      devId:             d.dev_id,
      name:              d.name,
      location:          d.location,
      enabled:           !!d.enabled,
      encryptMode:       d.encrypt_mode,
      lastSeenAt:        d.last_seen_at,
      lastRequestCode:   d.last_request_code,
      fwInfo:            d.fw_info,
      createdAt:         d.created_at,
      online:            isOnline(d.last_seen_at),
      pendingCommands:   pendingCount(db, d.dev_id),
      unmappedPunches:   unmappedCount(db, d.dev_id),
      lastBackfill:      lastBackfillSummary(db, d.dev_id),
      deviceUserCount:   deviceUserCount(db, d.dev_id),
    }));
    return sendOk(res, data);
  } catch (err) {
    return next(err);
  }
}

// ── POST /m68/devices ────────────────────────────────────────────────────────

function createDeviceHandler(req, res, next) {
  try {
    const { devId, name, location } = req.body || {};
    if (!devId || !String(devId).trim()) throw createHttpError(400, 'devId is required');

    const devIdClean = String(devId).trim();
    const db = getDb();

    // Unique check
    const existing = db.prepare('SELECT id FROM m68_devices WHERE dev_id = ?').get(devIdClean);
    if (existing) throw createHttpError(409, `Device ID "${devIdClean}" is already registered`);

    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO m68_devices (dev_id, name, location, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(devIdClean, String(name || '').trim(), location ? String(location).trim() : null, now, now);

    const row = db.prepare('SELECT * FROM m68_devices WHERE id = ?').get(result.lastInsertRowid);
    return sendOk(res, {
      id:      row.id,
      devId:   row.dev_id,
      name:    row.name,
      location: row.location,
      enabled: !!row.enabled,
    });
  } catch (err) {
    return next(err);
  }
}

// ── PUT /m68/devices/:id ─────────────────────────────────────────────────────

function updateDeviceHandler(req, res, next) {
  try {
    const { id } = req.params;
    const db = getDb();
    const device = db.prepare('SELECT * FROM m68_devices WHERE id = ?').get(id);
    if (!device) throw createHttpError(404, 'Device not found');

    const { name, location, enabled } = req.body || {};
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE m68_devices
      SET name = ?, location = ?, enabled = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name !== undefined ? String(name).trim() : device.name,
      location !== undefined ? (location ? String(location).trim() : null) : device.location,
      enabled !== undefined ? (enabled ? 1 : 0) : device.enabled,
      now,
      id,
    );

    const updated = db.prepare('SELECT * FROM m68_devices WHERE id = ?').get(id);
    return sendOk(res, {
      id:       updated.id,
      devId:    updated.dev_id,
      name:     updated.name,
      location: updated.location,
      enabled:  !!updated.enabled,
    });
  } catch (err) {
    return next(err);
  }
}

// ── DELETE /m68/devices/:id ──────────────────────────────────────────────────

function deleteDeviceHandler(req, res, next) {
  try {
    const { id } = req.params;
    const db = getDb();
    const device = db.prepare('SELECT * FROM m68_devices WHERE id = ?').get(id);
    if (!device) throw createHttpError(404, 'Device not found');

    // Delete pending commands for this device first
    db.prepare("DELETE FROM m68_commands WHERE dev_id = ? AND status = 'pending'").run(device.dev_id);
    db.prepare('DELETE FROM m68_devices WHERE id = ?').run(id);

    return sendOk(res, { deleted: true, id: Number(id), devId: device.dev_id });
  } catch (err) {
    return next(err);
  }
}

// ── GET /m68/status ──────────────────────────────────────────────────────────

function getStatusHandler(req, res, next) {
  try {
    const db = getDb();
    const listener = m68Service.getStatus();
    const lanIps = getLanIps();

    const devices = db.prepare('SELECT * FROM m68_devices ORDER BY created_at ASC').all().map(d => ({
      id:              d.id,
      devId:           d.dev_id,
      name:            d.name,
      location:        d.location,
      online:          isOnline(d.last_seen_at),
      lastSeenAt:      d.last_seen_at,
      lastRequestCode: d.last_request_code,
      pendingCommands: pendingCount(db, d.dev_id),
      unmappedPunches: unmappedCount(db, d.dev_id),
    }));

    return sendOk(res, {
      listener: {
        running: listener.running,
        port:    listener.port,
        bind:    listener.bind,
      },
      lanIps,
      devices,
    });
  } catch (err) {
    return next(err);
  }
}

// ── POST /m68/command ────────────────────────────────────────────────────────

function queueCommandHandler(req, res, next) {
  try {
    const { devId, cmdCode } = req.body || {};
    if (!devId || !String(devId).trim()) throw createHttpError(400, 'devId is required');
    if (!cmdCode || !ALLOWED_COMMANDS.has(String(cmdCode).trim())) {
      throw createHttpError(400, `cmdCode must be one of: ${[...ALLOWED_COMMANDS].join(', ')}`);
    }

    const devIdClean  = String(devId).trim();
    const cmdCodeClean = String(cmdCode).trim();

    const db = getDb();
    const device = db.prepare('SELECT * FROM m68_devices WHERE dev_id = ?').get(devIdClean);
    if (!device) throw createHttpError(404, `Device "${devIdClean}" not registered`);

    // Build cmd_param per command type.
    // SET_TIME: param is refreshed at delivery time in m68Service (server's live clock),
    // but we store the current time as a placeholder so the record is self-describing.
    let cmdParam = null;
    if (cmdCodeClean === 'SET_TIME') {
      cmdParam = JSON.stringify({ time: fkTime14(new Date()) });
    } else if (cmdCodeClean === 'GET_LOG_DATA') {
      // SDK demo queues GET_LOG_DATA with empty params — device returns all logs
      cmdParam = JSON.stringify({});
    } else if (cmdCodeClean === 'GET_DEVICE_STATUS') {
      cmdParam = JSON.stringify({});
    } else if (cmdCodeClean === 'GET_USER_ID_LIST') {
      cmdParam = JSON.stringify({});
    }

    const transId = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO m68_commands (dev_id, trans_id, cmd_code, cmd_param, status, created_at)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `).run(devIdClean, transId, cmdCodeClean, cmdParam, now);

    return sendOk(res, {
      queued:   true,
      transId,
      devId:    devIdClean,
      cmdCode:  cmdCodeClean,
      status:   'pending',
    });
  } catch (err) {
    return next(err);
  }
}

// ── GET /m68/devices/:id/users ───────────────────────────────────────────────

/**
 * List users enrolled on the device, joined with mapping status.
 * Each row includes: userId, userName (NULL if not fetched via GET_USER_INFO),
 * privilege, enabled, mappedEmployeeId, mappedEmployeeName (or null if unmapped).
 */
function listDeviceUsersHandler(req, res, next) {
  try {
    const { id } = req.params;
    const db = getDb();
    const device = db.prepare('SELECT * FROM m68_devices WHERE id = ?').get(id);
    if (!device) throw createHttpError(404, 'Device not found');

    // Get device users, joined with mapping (machine_id_mappings uses machine_emp_id = user_id as string)
    const rows = db.prepare(`
      SELECT
        du.user_id,
        du.user_name,
        du.privilege,
        du.enabled,
        du.backup_number,
        du.updated_at,
        m.employee_id AS mapped_employee_id,
        e.name AS mapped_employee_name,
        e.emp_code AS mapped_emp_code
      FROM m68_device_users du
      LEFT JOIN machine_id_mappings m ON m.machine_emp_id = CAST(du.user_id AS TEXT)
      LEFT JOIN employees e ON e.id = m.employee_id
      WHERE du.dev_id = ?
      ORDER BY du.user_id ASC
    `).all(device.dev_id);

    // Also find last GET_USER_ID_LIST command result for info
    const lastSync = db.prepare(`
      SELECT completed_at, result_summary FROM m68_commands
      WHERE dev_id = ? AND cmd_code = 'GET_USER_ID_LIST' AND status = 'done'
      ORDER BY completed_at DESC LIMIT 1
    `).get(device.dev_id);

    return sendOk(res, {
      devId: device.dev_id,
      lastSyncAt: lastSync ? lastSync.completed_at : null,
      lastSyncSummary: lastSync ? lastSync.result_summary : null,
      users: rows.map(r => ({
        userId:              r.user_id,
        userName:            r.user_name || null,
        privilege:           r.privilege,
        enabled:             !!r.enabled,
        backupNumber:        r.backup_number,
        mappedEmployeeId:    r.mapped_employee_id || null,
        mappedEmployeeName:  r.mapped_employee_name || null,
        mappedEmpCode:       r.mapped_emp_code || null,
      })),
    });
  } catch (err) {
    return next(err);
  }
}

// ── GET /m68/events ──────────────────────────────────────────────────────────

function listEventsHandler(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 500);
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, dev_id, kind, payload_b64, received_at
      FROM m68_events
      ORDER BY id DESC
      LIMIT ?
    `).all(limit);

    return sendOk(res, rows.map(r => ({
      id:          r.id,
      devId:       r.dev_id,
      kind:        r.kind,
      hasPayload:  !!r.payload_b64,
      receivedAt:  r.received_at,
    })));
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listDevicesHandler,
  createDeviceHandler,
  updateDeviceHandler,
  deleteDeviceHandler,
  listDeviceUsersHandler,
  getStatusHandler,
  queueCommandHandler,
  listEventsHandler,
};
