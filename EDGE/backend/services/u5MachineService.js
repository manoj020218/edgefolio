'use strict';
/**
 * U5-Zhongyan Face Recognition Machine — Service
 *
 * Supports three connection modes:
 *   http     — edge directly polls the device HTTP API (/getWorkNoteList etc.) on a timer.
 *              Same approach as the Gym EDGE-PC project. No MQTT broker needed.
 *              Device IP + port + password configured per-device in u5_devices table.
 *   embedded — starts a built-in aedes MQTT broker (zero user setup).
 *              The U5 device on the LAN connects directly to this broker.
 *   vps      — connects as an MQTT client to the user's existing VPS broker.
 *
 * Attendance records are staged into machine_import_staging with source_type='u5_face'
 * following the same pipeline used by ZK / ALOG / Jenix machines.
 */

const { getDb } = require('../config/database');
const { stageRecords } = require('../models/machineImportModel');
const { U5Adapter } = require('../hardware/u5/u5Adapter');

// ── Runtime state ─────────────────────────────────────────────────────────────
const _state = {
  aedesInstance: null,
  aedesNetServer: null,
  localClient: null,
  vpsClient: null,
  embeddedPort: 1883,
  deviceStatus: {},       // deviceSn → { online, lastSeen }
  httpPollTimers: {},     // deviceSn → setInterval handle
  httpAdapters: {},       // deviceSn → U5Adapter instance
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function tryRequire(mod) {
  try { return require(mod); } catch { return null; }
}

function getPref(key, fallback) {
  try {
    const row = getDb().prepare('SELECT value FROM app_preferences WHERE key = ?').get(key);
    return row?.value ?? fallback;
  } catch { return fallback; }
}

function setPref(key, value) {
  try {
    getDb().prepare(`
      INSERT INTO app_preferences (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(key, String(value));
  } catch {}
}

function shouldStoreFacePhoto() {
  return getPref('u5_store_face_photos', '0') === '1';
}

function loadDevices() {
  try { return getDb().prepare('SELECT * FROM u5_devices').all(); }
  catch { return []; }
}

// Extract device SN from topic: info/{token}/{deviceSn} → deviceSn
function snFromTopic(topic) {
  const parts = topic.split('/');
  return parts.length >= 3 ? parts[2] : null;
}

// ── Attendance record processing ──────────────────────────────────────────────
function processMessage(topic, message) {
  try {
    const payload = JSON.parse(message.toString());
    const deviceSn = snFromTopic(topic);
    if (!deviceSn) return;

    const cmd = payload.command || payload.cmd || '';

    if (cmd === 'upload_record' || cmd === 'attendance_record' || cmd === 'punch_record') {
      handleAttendanceRecord(deviceSn, payload.data || payload);
    } else if (cmd === 'status_report' || cmd === 'heartbeat' || cmd === 'device_status') {
      markDeviceOnline(deviceSn);
    } else if (cmd === 'access_record') {
      // Access control event — store for future Phase 2 UI
      handleAccessRecord(deviceSn, payload.data || payload);
    }
  } catch (err) {
    // Ignore non-JSON messages (ping packets, etc.)
  }
}

function markDeviceOnline(deviceSn) {
  const now = new Date().toISOString();
  _state.deviceStatus[deviceSn] = { online: true, lastSeen: now };
  try {
    getDb().prepare(
      'UPDATE u5_devices SET status=?, last_seen=?, updated_at=? WHERE device_sn=?'
    ).run('online', now, now, deviceSn);
  } catch {}
}

function markDeviceOffline(deviceSn) {
  _state.deviceStatus[deviceSn] = { ..._state.deviceStatus[deviceSn], online: false };
  try {
    getDb().prepare(
      'UPDATE u5_devices SET status=?, updated_at=? WHERE device_sn=?'
    ).run('offline', new Date().toISOString(), deviceSn);
  } catch {}
}

function handleAttendanceRecord(deviceSn, data) {
  markDeviceOnline(deviceSn);

  // Optionally strip face photo before staging
  const rawData = { ...data };
  if (!shouldStoreFacePhoto()) {
    delete rawData.noteImg;
    delete rawData.faceImg;
    delete rawData.employeePhoto;
    delete rawData.photo;
  }

  const noteTime = data.noteTime || data.recordTime || data.checkTime || '';
  const [punchDate, punchTime] = noteTime.includes(' ')
    ? noteTime.split(' ')
    : [noteTime, null];

  const stagingRecord = {
    machineEmpId: String(data.employeeId || data.userId || data.personId || '').trim(),
    machineName: data.employeeName || data.userName || data.personName || null,
    punchDate: punchDate || new Date().toISOString().slice(0, 10),
    punchTime: punchTime || null,
    direction: (data.noteType === 1 || data.direction === 'out') ? 'out' : 'in',
    mode: (data.noteWay === 0 || data.captureMode === 'face') ? 'face' : 'card',
    remark: data.notePass === 0 ? 'denied' : 'pass',
    recordType: 'punch',
    // Store original device data (photo conditionally stripped) for future reference
    deviceData: rawData,
  };

  if (!stagingRecord.machineEmpId) {
    console.warn('[U5] Received record with no employeeId — skipping');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const batchId = `U5-${deviceSn}-${today}`;

  try {
    stageRecords(batchId, 'u5_face', [stagingRecord]);
  } catch (err) {
    console.error('[U5] Failed to stage record:', err.message);
  }
}

function handleAccessRecord(deviceSn, data) {
  // Store same as attendance — access control display handled in Phase 2
  const rawData = { ...data, _eventType: 'access' };
  if (!shouldStoreFacePhoto()) { delete rawData.noteImg; delete rawData.photo; }

  const noteTime = data.noteTime || data.eventTime || '';
  const [punchDate, punchTime] = noteTime.includes(' ') ? noteTime.split(' ') : [noteTime, null];

  const stagingRecord = {
    machineEmpId: String(data.employeeId || data.personId || 'unknown').trim(),
    machineName: data.employeeName || null,
    punchDate: punchDate || new Date().toISOString().slice(0, 10),
    punchTime: punchTime || null,
    direction: data.accessDirection || 'in',
    mode: 'face',
    remark: data.accessResult || 'access',
    recordType: 'access',
    deviceData: rawData,
  };

  const today = new Date().toISOString().slice(0, 10);
  const batchId = `U5-${deviceSn}-${today}`;
  try { stageRecords(batchId, 'u5_face', [stagingRecord]); } catch {}
}

// ── HTTP polling (direct device API) ─────────────────────────────────────────

/**
 * Convert a naive datetime string from the device's local timezone to the
 * configured local timezone.
 *
 * The U5 device (Zhongyan) ships with its clock set to China Standard Time
 * (UTC+8). The EDGE PC runs in IST (UTC+5:30 = 330 min). Without conversion,
 * every punch would appear 2h30m in the future.
 *
 * u5_device_utc_offset : UTC offset of the device clock in minutes (default 480 = UTC+8)
 * u5_local_utc_offset  : UTC offset we want to store records in (default 330 = UTC+5:30 IST)
 *
 * Returns a "YYYY-MM-DD HH:MM:SS" string in the target timezone.
 */
function convertDeviceTime(checkinTime, deviceOffsetMin, localOffsetMin) {
  if (!checkinTime) return checkinTime;
  try {
    // Parse device time string as if it were UTC, then shift by device offset
    const normalized = checkinTime.trim().replace(' ', 'T') + 'Z';
    const parsedMs   = Date.parse(normalized);
    if (isNaN(parsedMs)) return checkinTime;
    // parsedMs is UTC-as-if-device-was-UTC; subtract device offset to get real UTC
    const utcMs      = parsedMs - deviceOffsetMin * 60000;
    // Add local offset to get local wall-clock time
    const localMs    = utcMs + localOffsetMin * 60000;
    const d          = new Date(localMs);
    const pad        = n => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
           `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  } catch {
    return checkinTime;
  }
}

function getAdapter(device) {
  const sn = device.device_sn;
  if (!_state.httpAdapters[sn]) {
    _state.httpAdapters[sn] = new U5Adapter({
      ip:         device.device_ip,
      port:       device.device_port || 80,
      password:   device.device_password || '123456',
      timeoutMs:  15000,
    });
  }
  return _state.httpAdapters[sn];
}

async function pollHttpDevice(device) {
  const sn      = device.device_sn;
  const adapter = getAdapter(device);

  // Read last polled timestamp so we only fetch new records
  let afterTime = null;
  try {
    const row = getDb().prepare('SELECT last_polled_at FROM u5_devices WHERE device_sn = ?').get(sn);
    afterTime = row && row.last_polled_at ? row.last_polled_at : null;
  } catch {}

  const result = await adapter.getAttendanceLogs(afterTime);
  if (!result.success) {
    console.warn(`[U5-HTTP] ${sn}: poll failed — ${result.message}`);
    markDeviceOffline(sn);
    return;
  }

  markDeviceOnline(sn);

  const rows = result.data;
  if (!rows.length) return;

  // Timezone conversion: device (UTC+8 China) → local (UTC+5:30 IST by default)
  const deviceOffsetMin = Number(getPref('u5_device_utc_offset', '480'));
  const localOffsetMin  = Number(getPref('u5_local_utc_offset',  '330'));

  const today    = new Date().toISOString().slice(0, 10);
  const batchId  = `U5-HTTP-${sn}-${today}`;

  const stagingRows = rows.map(row => {
    const localTime = convertDeviceTime(row.checkin_time, deviceOffsetMin, localOffsetMin);
    const parts     = (localTime || '').includes(' ') ? localTime.split(' ') : [localTime, null];
    return {
      machineEmpId: String(row.id_number || row.userId || '').trim(),
      machineName:  row.name || null,
      punchDate:    parts[0] || today,
      punchTime:    parts[1] || null,
      direction:    'in',
      mode:         'face',
      remark:       row.ispass === 0 ? 'denied' : 'pass',
      recordType:   'punch',
      deviceData:   row,
    };
  }).filter(r => r.machineEmpId);

  if (stagingRows.length) {
    try {
      stageRecords(batchId, 'u5_face', stagingRows);
      console.log(`[U5-HTTP] ${sn}: staged ${stagingRows.length} record(s)`);
    } catch (err) {
      console.error(`[U5-HTTP] ${sn}: stageRecords failed — ${err.message}`);
    }
  }

  // Advance the watermark to the latest checkin_time seen
  const times = rows.map(r => r.checkin_time).filter(Boolean).sort();
  if (times.length) {
    const latest = times[times.length - 1];
    try {
      getDb().prepare(
        'UPDATE u5_devices SET last_polled_at=?, updated_at=? WHERE device_sn=?'
      ).run(latest, new Date().toISOString(), sn);
    } catch {}
  }
}

function startHttpPolling() {
  const devices = loadDevices().filter(d => d.connection_mode === 'http' && d.device_ip);
  if (!devices.length) return;

  const intervalMs = Number(getPref('u5_http_poll_interval_sec', '30')) * 1000;

  for (const device of devices) {
    const sn = device.device_sn;
    if (_state.httpPollTimers[sn]) continue;   // already polling

    console.log(`[U5-HTTP] Starting HTTP poll for ${sn} at ${device.device_ip} every ${intervalMs / 1000}s`);

    // Initial poll immediately, then on interval
    pollHttpDevice(device).catch(() => {});
    _state.httpPollTimers[sn] = setInterval(() => {
      // Reload device row each tick so IP/password changes take effect without restart
      const fresh = loadDevices().find(d => d.device_sn === sn);
      if (!fresh || fresh.connection_mode !== 'http') {
        stopHttpPolling(sn);
        return;
      }
      // Invalidate cached adapter if IP/password changed
      const cached = _state.httpAdapters[sn];
      if (cached && (cached._base !== `http://${fresh.device_ip}:${fresh.device_port || 80}` ||
                     cached._password !== (fresh.device_password || '123456'))) {
        delete _state.httpAdapters[sn];
      }
      pollHttpDevice(fresh).catch(() => {});
    }, intervalMs);
  }
}

function stopHttpPolling(sn) {
  if (_state.httpPollTimers[sn]) {
    clearInterval(_state.httpPollTimers[sn]);
    delete _state.httpPollTimers[sn];
  }
  delete _state.httpAdapters[sn];
}

function stopAllHttpPolling() {
  for (const sn of Object.keys(_state.httpPollTimers)) {
    stopHttpPolling(sn);
  }
}

// ── Embedded MQTT broker (aedes) ──────────────────────────────────────────────
function startEmbeddedBroker() {
  const aedes = tryRequire('aedes');
  if (!aedes) {
    console.warn('[U5] aedes not installed — embedded MQTT broker disabled.');
    console.warn('[U5] Run: npm install aedes mqtt   to enable local device connection.');
    return false;
  }

  const net = require('net');
  const port = Number(getPref('u5_embedded_port', '1883'));
  _state.embeddedPort = port;

  try {
    const broker = aedes();
    _state.aedesInstance = broker;

    broker.on('client', (client) => {
      console.log(`[U5-Broker] Device connected: ${client.id}`);
      // client.id is the MQTT clientId — may or may not be deviceSn
    });

    broker.on('clientDisconnect', (client) => {
      console.log(`[U5-Broker] Device disconnected: ${client.id}`);
    });

    broker.on('publish', (packet, client) => {
      // client is null for internal publishes; skip those
      if (!client) return;
      // Route to our handler
      processMessage(packet.topic, packet.payload);
    });

    const server = net.createServer(broker.handle);
    server.listen(port, '0.0.0.0', () => {
      console.log(`[U5-Broker] Embedded MQTT broker listening on port ${port}`);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[U5-Broker] Port ${port} already in use — another MQTT broker may be running.`);
      } else {
        console.error('[U5-Broker] Server error:', err.message);
      }
    });
    _state.aedesNetServer = server;
    return true;
  } catch (err) {
    console.error('[U5-Broker] Failed to start embedded broker:', err.message);
    return false;
  }
}

// ── VPS MQTT client ───────────────────────────────────────────────────────────
function startVpsClient() {
  const mqtt = tryRequire('mqtt');
  if (!mqtt) {
    console.warn('[U5-VPS] mqtt not installed — VPS mode disabled. Run: npm install mqtt');
    return;
  }

  const vpsHost = getPref('u5_vps_host', null);
  const vpsPort = getPref('u5_vps_port', '1883');
  const vpsUser = getPref('u5_vps_username', null);
  const vpsPass = getPref('u5_vps_password', null);

  const vpsDevices = loadDevices().filter(d => d.connection_mode === 'vps');
  if (!vpsDevices.length || !vpsHost) return;

  const opts = {
    clientId: 'edgefolio_u5_' + Math.random().toString(16).slice(2, 10),
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
  };
  if (vpsUser) opts.username = vpsUser;
  if (vpsPass) opts.password = vpsPass;

  const url = `mqtt://${vpsHost}:${vpsPort}`;
  const client = mqtt.connect(url, opts);

  client.on('connect', () => {
    console.log(`[U5-VPS] Connected to ${url}`);
    for (const dev of vpsDevices) {
      const token = dev.mqtt_token || 'edge';
      client.subscribe(`info/${token}/${dev.device_sn}`, { qos: 1 });
      client.subscribe(`result_server/${token}/${dev.device_sn}`, { qos: 1 });
      console.log(`[U5-VPS] Subscribed for device ${dev.device_sn}`);
    }
  });

  client.on('message', (topic, msg) => processMessage(topic, msg));
  client.on('error', (err) => console.error('[U5-VPS] Error:', err.message));
  client.on('offline', () => console.warn('[U5-VPS] Offline — will retry'));
  client.on('close', () => console.log('[U5-VPS] Disconnected'));

  _state.vpsClient = client;
}

// ── Public API ────────────────────────────────────────────────────────────────
function start() {
  startHttpPolling();
  startEmbeddedBroker();
  // Slight delay so the broker is ready before VPS client also needs mqtt
  setTimeout(startVpsClient, 1500);
}

function stop() {
  stopAllHttpPolling();
  if (_state.vpsClient)      { _state.vpsClient.end(true);           _state.vpsClient = null; }
  if (_state.localClient)    { _state.localClient.end(true);         _state.localClient = null; }
  if (_state.aedesNetServer) { _state.aedesNetServer.close();        _state.aedesNetServer = null; }
  if (_state.aedesInstance)  { _state.aedesInstance.close(() => {}); _state.aedesInstance = null; }
}

function restartVps() {
  if (_state.vpsClient) { _state.vpsClient.end(true); _state.vpsClient = null; }
  startVpsClient();
}

function getStatus() {
  const devices = loadDevices();
  return {
    embeddedBrokerRunning: !!_state.aedesNetServer,
    embeddedBrokerPort: _state.embeddedPort,
    vpsConnected: _state.vpsClient?.connected || false,
    devices: devices.map(d => ({
      id: d.id,
      deviceSn: d.device_sn,
      deviceName: d.device_name,
      connectionMode: d.connection_mode,
      online: _state.deviceStatus[d.device_sn]?.online ?? (d.status === 'online'),
      lastSeen: _state.deviceStatus[d.device_sn]?.lastSeen ?? d.last_seen,
      status: d.status,
    })),
  };
}

function sendCommand(deviceSn, command, data) {
  const device = loadDevices().find(d => d.device_sn === deviceSn);
  if (!device) return { ok: false, error: 'Device not found' };

  const token = device.mqtt_token || 'edge';
  const topic = `order/${token}/${deviceSn}`;
  const payload = JSON.stringify({ command, data: data || {} });

  if (device.connection_mode === 'vps' && _state.vpsClient?.connected) {
    _state.vpsClient.publish(topic, payload, { qos: 1 });
    return { ok: true };
  }

  // For embedded mode: use aedes broker's publish API
  if (_state.aedesInstance) {
    const fakePacket = {
      topic,
      payload: Buffer.from(payload),
      qos: 1,
      retain: false,
    };
    _state.aedesInstance.publish(fakePacket, () => {});
    return { ok: true };
  }

  return { ok: false, error: 'Not connected' };
}

// ── HTTP adapter helpers (exposed for controller) ─────────────────────────────

async function enrollFaceOnDevice(deviceSn, opts) {
  const device = loadDevices().find(d => d.device_sn === deviceSn);
  if (!device) return { success: false, message: 'Device not found' };
  if (device.connection_mode !== 'http') return { success: false, message: 'Device is not in HTTP mode — enroll via MQTT command' };
  return getAdapter(device).enrollFace(opts);
}

async function deleteEmployeeFromDevice(deviceSn, userId) {
  const device = loadDevices().find(d => d.device_sn === deviceSn);
  if (!device) return { success: false, message: 'Device not found' };
  if (device.connection_mode !== 'http') return { success: false, message: 'Device is not in HTTP mode' };
  return getAdapter(device).deleteEmployee(userId);
}

async function getDeviceEmployeeList(deviceSn) {
  const device = loadDevices().find(d => d.device_sn === deviceSn);
  if (!device) return { success: false, message: 'Device not found' };
  if (device.connection_mode !== 'http') return { success: false, message: 'Device is not in HTTP mode' };
  return getAdapter(device).getEmployeeList();
}

async function openDeviceDoor(deviceSn) {
  const device = loadDevices().find(d => d.device_sn === deviceSn);
  if (!device) return { success: false, message: 'Device not found' };
  if (device.connection_mode !== 'http') return { success: false, message: 'Device is not in HTTP mode — send openDoor command via MQTT instead' };
  return getAdapter(device).openDoor();
}

async function pingDevice(deviceSn) {
  const device = loadDevices().find(d => d.device_sn === deviceSn);
  if (!device) return { success: false, message: 'Device not found' };
  if (device.connection_mode !== 'http') return { success: false, message: 'Device is not in HTTP mode' };
  return { success: await getAdapter(device).ping() };
}

async function getDeviceInfo(deviceSn) {
  const device = loadDevices().find(d => d.device_sn === deviceSn);
  if (!device) return { success: false, message: 'Device not found' };
  if (device.connection_mode !== 'http') return { success: false, message: 'Device is not in HTTP mode' };
  return getAdapter(device).getDeviceVersion();
}

module.exports = {
  start,
  stop,
  restartVps,
  getStatus,
  sendCommand,
  getPref,
  setPref,
  // HTTP adapter methods
  enrollFaceOnDevice,
  deleteEmployeeFromDevice,
  getDeviceEmployeeList,
  openDeviceDoor,
  pingDevice,
  getDeviceInfo,
  startHttpPolling,
  stopHttpPolling,
};
