'use strict';
const { sendOk, createHttpError } = require('../utils/http');
const model = require('../models/u5DeviceModel');
const u5Service = require('../services/u5MachineService');

// ── Device CRUD ───────────────────────────────────────────────────────────────
function serializeDevice(row) {
  if (!row) return null;
  return {
    id: row.id,
    deviceName: row.device_name,
    deviceSn: row.device_sn,
    connectionMode: row.connection_mode,
    mqttToken: row.mqtt_token,
    vpsHost: row.vps_host,
    vpsPort: row.vps_port,
    vpsUsername: row.vps_username,
    // Never return vps_password to client
    embeddedPort: row.embedded_port,
    status: row.status,
    lastSeen: row.last_seen,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
            vpsHost, vpsPort, vpsUsername, vpsPassword, embeddedPort } = req.body || {};
    if (!deviceName) throw createHttpError(400, 'deviceName is required');
    if (!deviceSn)   throw createHttpError(400, 'deviceSn (serial number) is required');

    const row = model.createDevice({
      deviceName, deviceSn, connectionMode, mqttToken,
      vpsHost, vpsPort, vpsUsername, vpsPassword, embeddedPort,
    });

    // If VPS device added, reconnect VPS client to pick up new subscription
    if (connectionMode === 'vps') u5Service.restartVps();

    sendOk(res, serializeDevice(row));
  } catch (e) { next(e); }
}

async function updateDeviceHandler(req, res, next) {
  try {
    const { id } = req.params;
    const row = model.updateDevice(id, req.body || {});
    if (!row) throw createHttpError(404, 'Device not found');

    if (row.connection_mode === 'vps') u5Service.restartVps();

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

module.exports = {
  listDevicesHandler,
  createDeviceHandler,
  updateDeviceHandler,
  deleteDeviceHandler,
  getStatusHandler,
  sendCommandHandler,
  getPreferencesHandler,
  updatePreferencesHandler,
};
