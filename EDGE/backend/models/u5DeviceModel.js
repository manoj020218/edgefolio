'use strict';
const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');

function listDevices() {
  return getDb().prepare('SELECT * FROM u5_devices ORDER BY created_at').all();
}

function findDeviceById(id) {
  return getDb().prepare('SELECT * FROM u5_devices WHERE id = ?').get(id);
}

function findDeviceBySn(deviceSn) {
  return getDb().prepare('SELECT * FROM u5_devices WHERE device_sn = ?').get(deviceSn);
}

function createDevice(payload) {
  const db = getDb();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO u5_devices (
      id, device_name, device_sn, connection_mode, mqtt_token,
      vps_host, vps_port, vps_username, vps_password, embedded_port, status
    ) VALUES (
      @id, @device_name, @device_sn, @connection_mode, @mqtt_token,
      @vps_host, @vps_port, @vps_username, @vps_password, @embedded_port, @status
    )
  `).run({
    id,
    device_name: payload.deviceName || payload.device_name,
    device_sn: payload.deviceSn || payload.device_sn,
    connection_mode: payload.connectionMode || payload.connection_mode || 'embedded',
    mqtt_token: payload.mqttToken || payload.mqtt_token || 'edge',
    vps_host: payload.vpsHost || payload.vps_host || null,
    vps_port: Number(payload.vpsPort || payload.vps_port || 1883),
    vps_username: payload.vpsUsername || payload.vps_username || null,
    vps_password: payload.vpsPassword || payload.vps_password || null,
    embedded_port: Number(payload.embeddedPort || payload.embedded_port || 1883),
    status: 'offline',
  });
  return findDeviceById(id);
}

function updateDevice(id, payload) {
  const db = getDb();
  const existing = findDeviceById(id);
  if (!existing) return null;
  db.prepare(`
    UPDATE u5_devices
    SET device_name=@device_name, device_sn=@device_sn, connection_mode=@connection_mode,
        mqtt_token=@mqtt_token, vps_host=@vps_host, vps_port=@vps_port,
        vps_username=@vps_username, vps_password=@vps_password,
        embedded_port=@embedded_port, updated_at=@updated_at
    WHERE id=@id
  `).run({
    id,
    device_name: payload.deviceName ?? payload.device_name ?? existing.device_name,
    device_sn: payload.deviceSn ?? payload.device_sn ?? existing.device_sn,
    connection_mode: payload.connectionMode ?? payload.connection_mode ?? existing.connection_mode,
    mqtt_token: payload.mqttToken ?? payload.mqtt_token ?? existing.mqtt_token,
    vps_host: payload.vpsHost ?? payload.vps_host ?? existing.vps_host,
    vps_port: Number(payload.vpsPort ?? payload.vps_port ?? existing.vps_port),
    vps_username: payload.vpsUsername ?? payload.vps_username ?? existing.vps_username,
    vps_password: payload.vpsPassword ?? payload.vps_password ?? existing.vps_password,
    embedded_port: Number(payload.embeddedPort ?? payload.embedded_port ?? existing.embedded_port),
    updated_at: new Date().toISOString(),
  });
  return findDeviceById(id);
}

function updateDeviceStatus(deviceSn, status) {
  getDb().prepare(
    'UPDATE u5_devices SET status=?, last_seen=?, updated_at=? WHERE device_sn=?'
  ).run(status, new Date().toISOString(), new Date().toISOString(), deviceSn);
}

function deleteDevice(id) {
  return getDb().prepare('DELETE FROM u5_devices WHERE id = ?').run(id).changes > 0;
}

module.exports = {
  listDevices,
  findDeviceById,
  findDeviceBySn,
  createDevice,
  updateDevice,
  updateDeviceStatus,
  deleteDevice,
};
