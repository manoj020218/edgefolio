'use strict';
const { sendOk, createHttpError } = require('../utils/http');
const model = require('../models/u5DeviceModel');
const u5Service = require('../services/u5MachineService');

// ── Device CRUD ───────────────────────────────────────────────────────────────
function serializeDevice(row) {
  if (!row) return null;
  return {
    id:             row.id,
    deviceName:     row.device_name,
    deviceSn:       row.device_sn,
    connectionMode: row.connection_mode,
    mqttToken:      row.mqtt_token,
    vpsHost:        row.vps_host,
    vpsPort:        row.vps_port,
    vpsUsername:    row.vps_username,
    // Never return vps_password or device_password to client
    embeddedPort:   row.embedded_port,
    deviceIp:       row.device_ip,
    devicePort:     row.device_port,
    lastPolledAt:   row.last_polled_at,
    status:         row.status,
    lastSeen:       row.last_seen,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
  };
}

async function listDevicesHandler(req, res, next) {
  try {
    const rows = model.listDevices();
    sendOk(res, rows.map(serializeDevice));
  } catch (e) { next(e); }
}

async function createDeviceHandler(req, res, next) {
  try {
    const { deviceName, deviceSn, connectionMode, mqttToken,
            vpsHost, vpsPort, vpsUsername, vpsPassword, embeddedPort,
            deviceIp, devicePort, devicePassword } = req.body || {};
    if (!deviceName) throw createHttpError(400, 'deviceName is required');
    if (!deviceSn)   throw createHttpError(400, 'deviceSn (serial number) is required');
    if (connectionMode === 'http' && !deviceIp) throw createHttpError(400, 'deviceIp is required for HTTP mode');

    const row = model.createDevice({
      deviceName, deviceSn, connectionMode, mqttToken,
      vpsHost, vpsPort, vpsUsername, vpsPassword, embeddedPort,
      deviceIp, devicePort, devicePassword,
    });

    if (connectionMode === 'vps')  u5Service.restartVps();
    if (connectionMode === 'http') u5Service.startHttpPolling();

    sendOk(res, serializeDevice(row));
  } catch (e) { next(e); }
}

async function updateDeviceHandler(req, res, next) {
  try {
    const { id } = req.params;
    const row = model.updateDevice(id, req.body || {});
    if (!row) throw createHttpError(404, 'Device not found');

    if (row.connection_mode === 'vps')  u5Service.restartVps();
    if (row.connection_mode === 'http') {
      u5Service.stopHttpPolling(row.device_sn);
      u5Service.startHttpPolling();
    }

    sendOk(res, serializeDevice(row));
  } catch (e) { next(e); }
}

async function deleteDeviceHandler(req, res, next) {
  try {
    const { id } = req.params;
    const deleted = model.deleteDevice(id);
    if (!deleted) throw createHttpError(404, 'Device not found');
    sendOk(res, { deleted: true });
  } catch (e) { next(e); }
}

// ── Status ────────────────────────────────────────────────────────────────────
async function getStatusHandler(req, res, next) {
  try {
    sendOk(res, u5Service.getStatus());
  } catch (e) { next(e); }
}

// ── Send command to device ────────────────────────────────────────────────────
async function sendCommandHandler(req, res, next) {
  try {
    const { deviceSn, command, data } = req.body || {};
    if (!deviceSn) throw createHttpError(400, 'deviceSn is required');
    if (!command)  throw createHttpError(400, 'command is required');

    const result = u5Service.sendCommand(deviceSn, command, data);
    if (!result.ok) throw createHttpError(400, result.error || 'Command failed');
    sendOk(res, { sent: true, command, deviceSn });
  } catch (e) { next(e); }
}

// ── Preferences ───────────────────────────────────────────────────────────────
const PREF_KEYS = [
  'u5_store_face_photos',
  'u5_embedded_port',
  'u5_vps_host',
  'u5_vps_port',
  'u5_vps_username',
  'u5_vps_token',
  'u5_http_poll_interval_sec',
  'u5_device_utc_offset',  // device clock UTC offset in minutes (480 = UTC+8 China, default)
  'u5_local_utc_offset',   // target store timezone in minutes  (330 = UTC+5:30 IST, default)
];

async function getPreferencesHandler(req, res, next) {
  try {
    const prefs = {};
    for (const k of PREF_KEYS) {
      prefs[k] = u5Service.getPref(k, null);
    }
    sendOk(res, prefs);
  } catch (e) { next(e); }
}

async function updatePreferencesHandler(req, res, next) {
  try {
    const body = req.body || {};
    // Persist allowed keys (never persist vps_password via this endpoint — use device form)
    const allowed = new Set(PREF_KEYS);
    allowed.add('u5_vps_password');

    for (const [k, v] of Object.entries(body)) {
      if (allowed.has(k)) u5Service.setPref(k, v);
    }

    // Restart VPS client if VPS settings changed
    const vpsChanged = ['u5_vps_host', 'u5_vps_port', 'u5_vps_username', 'u5_vps_password', 'u5_vps_token']
      .some(k => k in body);
    if (vpsChanged) u5Service.restartVps();

    sendOk(res, { saved: true });
  } catch (e) { next(e); }
}

// ── HTTP adapter endpoints (connection_mode='http' devices only) ───────────────

async function enrollFaceHandler(req, res, next) {
  try {
    const { deviceSn, idNumber, name, picLarge, cardNumber } = req.body || {};
    if (!deviceSn)  throw createHttpError(400, 'deviceSn is required');
    if (!idNumber)  throw createHttpError(400, 'idNumber is required');
    if (!name)      throw createHttpError(400, 'name is required');
    if (!picLarge)  throw createHttpError(400, 'picLarge (data URL) is required');
    const result = await u5Service.enrollFaceOnDevice(deviceSn, { idNumber, name, picLarge, cardNumber });
    if (!result.success) throw createHttpError(400, result.message || 'Enrollment failed');
    sendOk(res, result);
  } catch (e) { next(e); }
}

async function deleteEmployeeHandler(req, res, next) {
  try {
    const { deviceSn, userId } = req.body || {};
    if (!deviceSn) throw createHttpError(400, 'deviceSn is required');
    if (!userId)   throw createHttpError(400, 'userId is required');
    const result = await u5Service.deleteEmployeeFromDevice(deviceSn, userId);
    if (!result.success) throw createHttpError(400, result.message || 'Delete failed');
    sendOk(res, result);
  } catch (e) { next(e); }
}

async function listDeviceEmployeesHandler(req, res, next) {
  try {
    const { deviceSn } = req.params;
    const result = await u5Service.getDeviceEmployeeList(deviceSn);
    if (!result.success) throw createHttpError(400, result.message || 'Failed to fetch employee list');
    sendOk(res, result.data);
  } catch (e) { next(e); }
}

async function openDoorHandler(req, res, next) {
  try {
    const { deviceSn } = req.body || {};
    if (!deviceSn) throw createHttpError(400, 'deviceSn is required');
    const result = await u5Service.openDeviceDoor(deviceSn);
    if (!result.success) throw createHttpError(400, result.message || 'Door open failed');
    sendOk(res, result);
  } catch (e) { next(e); }
}

async function pingDeviceHandler(req, res, next) {
  try {
    const { deviceSn } = req.params;
    const result = await u5Service.pingDevice(deviceSn);
    sendOk(res, result);
  } catch (e) { next(e); }
}

async function getDeviceInfoHandler(req, res, next) {
  try {
    const { deviceSn } = req.params;
    const result = await u5Service.getDeviceInfo(deviceSn);
    if (!result.success) throw createHttpError(400, result.message || 'Failed to read device info');
    sendOk(res, result.info);
  } catch (e) { next(e); }
}

module.exports = {
  listDevicesHandler,
  createDeviceHandler,
  updateDeviceHandler,
  deleteDeviceHandler,
  getStatusHandler,
  sendCommandHandler,
  getPreferencesHandler,
  updatePreferencesHandler,
  // HTTP adapter endpoints
  enrollFaceHandler,
  deleteEmployeeHandler,
  listDeviceEmployeesHandler,
  openDoorHandler,
  pingDeviceHandler,
  getDeviceInfoHandler,
};
