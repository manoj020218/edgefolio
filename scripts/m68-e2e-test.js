'use strict';
/**
 * m68-e2e-test.js — Backend E2E test for M68 API routes.
 *
 * Starts the Express app in-process with temp storage + license stub,
 * runs auth setup → login → license activate → CRUD devices → queue commands
 * → 401 without token.
 *
 * No hardware, no running servers required.
 *
 * Run: node scripts/m68-e2e-test.js
 */

const http = require('http');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

// ── Temp storage ──────────────────────────────────────────────────────────────
const TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ef-m68-e2e-'));
process.env.EDGEFOLIO_STORAGE_PATH = TMPDIR;
process.env.EDGE_M68_PORT          = '15005';  // Avoid conflict with real listener

// ── Start license stub inline ─────────────────────────────────────────────────
const STUB_PORT = 40001 + Math.floor(Math.random() * 1000);
const APP_PORT  = 17001 + Math.floor(Math.random() * 1000);
process.env.EDGE_LICENSE_API = `http://127.0.0.1:${STUB_PORT}`;

const jwt = require(path.join(__dirname, '..', 'EDGE', 'node_modules', 'jsonwebtoken'));
const PRIVATE_KEY = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', '..', 'Billing at IOT soft', 'billing-server', 'keys', 'edge-license-private.pem'),
  'utf8'
);
function signLicense(claims) {
  return jwt.sign(claims, PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '400d' });
}
const licenseStub = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    const data = body ? JSON.parse(body) : {};
    const key = (data.licenseKey || 'EF-TEST-GOOD').toUpperCase();
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
    const claims = {
      licenseKey: key, machineId: data.machineId,
      plan: { name: 'Trial', maxEmployees: 25 },
      status: 'trial', expiresAt, graceDays: 15,
      issuedAt: new Date().toISOString(),
    };
    const payload = JSON.stringify({ license: signLicense(claims), ok: true });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
    res.end(payload);
  });
});
licenseStub.listen(STUB_PORT, '127.0.0.1');

// ── Load Express app ──────────────────────────────────────────────────────────
const { app } = require(path.join(__dirname, '..', 'EDGE', 'backend', 'server'));
const API = `http://127.0.0.1:${APP_PORT}/api/v1`;
const server = app.listen(APP_PORT, '127.0.0.1');

// ── HTTP helper ───────────────────────────────────────────────────────────────
function req(method, url, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const u = new URL(url);
    const options = {
      method,
      hostname: u.hostname,
      port:     u.port,
      path:     u.pathname,
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': payload ? Buffer.byteLength(payload) : 0,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    const r = http.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

// ── Test harness ──────────────────────────────────────────────────────────────
let passed = 0; let failed = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

async function run() {
  await new Promise(r => setTimeout(r, 200)); // let server settle

  console.log('\n=== auth setup + login ===');
  let r = await req('POST', `${API}/auth/setup`, { email: 'admin@test.local', password: 'admin1234' });
  check('setup 200 or 409', [200, 201, 409].includes(r.status), `got ${r.status}`);

  r = await req('POST', `${API}/auth/login`, { email: 'admin@test.local', password: 'admin1234' });
  check('login 200', r.status === 200, `got ${r.status} body=${JSON.stringify(r.body)}`);
  const TOKEN = r.body.data?.token;
  check('got token', !!TOKEN, `token=${TOKEN}`);

  console.log('\n=== license activate ===');
  r = await req('POST', `${API}/license/activate`, { licenseKey: 'EF-TEST-GOOD-0000-0001' }, TOKEN);
  check('activate 200', r.status === 200, `got ${r.status} body=${JSON.stringify(r.body)}`);

  console.log('\n=== 401 without token ===');
  r = await req('GET', `${API}/m68/devices`);
  check('GET /m68/devices 401 no token', r.status === 401, `got ${r.status}`);

  r = await req('POST', `${API}/m68/command`, { devId: 'X', cmdCode: 'SET_TIME' });
  check('POST /m68/command 401 no token', r.status === 401, `got ${r.status}`);

  console.log('\n=== GET /m68/status (empty) ===');
  r = await req('GET', `${API}/m68/status`, null, TOKEN);
  check('status 200', r.status === 200, `got ${r.status}`);
  check('status.listener exists', !!r.body.data?.listener, JSON.stringify(r.body.data));
  check('status.lanIps is array', Array.isArray(r.body.data?.lanIps), JSON.stringify(r.body.data?.lanIps));

  console.log('\n=== POST /m68/devices (create) ===');
  r = await req('POST', `${API}/m68/devices`, { devId: 'SIM001', name: 'Sim Device 1', location: 'Test Lab' }, TOKEN);
  check('create 200', r.status === 200, `got ${r.status} body=${JSON.stringify(r.body)}`);
  check('create returns devId', r.body.data?.devId === 'SIM001', `got ${r.body.data?.devId}`);
  const deviceId = r.body.data?.id;
  check('create returns id', !!deviceId, `id=${deviceId}`);

  console.log('\n=== POST /m68/devices duplicate ===');
  r = await req('POST', `${API}/m68/devices`, { devId: 'SIM001', name: 'Duplicate' }, TOKEN);
  check('duplicate → 409', r.status === 409, `got ${r.status}`);

  console.log('\n=== POST /m68/devices missing devId ===');
  r = await req('POST', `${API}/m68/devices`, { devId: '', name: 'No ID' }, TOKEN);
  check('missing devId → 400', r.status === 400, `got ${r.status}`);

  console.log('\n=== GET /m68/devices ===');
  r = await req('GET', `${API}/m68/devices`, null, TOKEN);
  check('list 200', r.status === 200, `got ${r.status}`);
  check('list has 1 device', r.body.data?.length === 1, `len=${r.body.data?.length}`);
  const d = r.body.data?.[0];
  check('list device devId', d?.devId === 'SIM001', `got ${d?.devId}`);
  check('list device has pendingCommands', typeof d?.pendingCommands === 'number', `got ${d?.pendingCommands}`);
  check('list device has unmappedPunches', typeof d?.unmappedPunches === 'number', `got ${d?.unmappedPunches}`);
  check('list device has online boolean', typeof d?.online === 'boolean', `got ${d?.online}`);
  check('new device is offline', d?.online === false, `got ${d?.online}`);

  console.log('\n=== PUT /m68/devices/:id ===');
  r = await req('PUT', `${API}/m68/devices/${deviceId}`, { name: 'Updated Name', location: 'Floor 2' }, TOKEN);
  check('update 200', r.status === 200, `got ${r.status}`);
  check('update name', r.body.data?.name === 'Updated Name', `got ${r.body.data?.name}`);
  check('update location', r.body.data?.location === 'Floor 2', `got ${r.body.data?.location}`);

  console.log('\n=== POST /m68/command SET_TIME ===');
  r = await req('POST', `${API}/m68/command`, { devId: 'SIM001', cmdCode: 'SET_TIME' }, TOKEN);
  check('queue SET_TIME 200', r.status === 200, `got ${r.status}`);
  check('queue SET_TIME returns transId', !!r.body.data?.transId, `tid=${r.body.data?.transId}`);
  check('queue SET_TIME status=pending', r.body.data?.status === 'pending', `got ${r.body.data?.status}`);

  console.log('\n=== POST /m68/command GET_LOG_DATA ===');
  r = await req('POST', `${API}/m68/command`, { devId: 'SIM001', cmdCode: 'GET_LOG_DATA' }, TOKEN);
  check('queue GET_LOG_DATA 200', r.status === 200, `got ${r.status}`);

  console.log('\n=== POST /m68/command GET_DEVICE_STATUS ===');
  r = await req('POST', `${API}/m68/command`, { devId: 'SIM001', cmdCode: 'GET_DEVICE_STATUS' }, TOKEN);
  check('queue GET_DEVICE_STATUS 200', r.status === 200, `got ${r.status}`);

  console.log('\n=== POST /m68/command invalid cmdCode ===');
  r = await req('POST', `${API}/m68/command`, { devId: 'SIM001', cmdCode: 'DELETE_ALL' }, TOKEN);
  check('bad cmdCode → 400', r.status === 400, `got ${r.status}`);

  console.log('\n=== POST /m68/command unknown device ===');
  r = await req('POST', `${API}/m68/command`, { devId: 'NOTEXIST', cmdCode: 'SET_TIME' }, TOKEN);
  check('unknown device → 404', r.status === 404, `got ${r.status}`);

  console.log('\n=== GET /m68/devices (pending commands count) ===');
  r = await req('GET', `${API}/m68/devices`, null, TOKEN);
  const d2 = r.body.data?.[0];
  check('pending commands = 3', d2?.pendingCommands === 3, `got ${d2?.pendingCommands}`);

  console.log('\n=== GET /m68/events ===');
  r = await req('GET', `${API}/m68/events?limit=10`, null, TOKEN);
  check('events 200', r.status === 200, `got ${r.status}`);
  check('events is array', Array.isArray(r.body.data), `got ${typeof r.body.data}`);

  console.log('\n=== GET /m68/status (with device) ===');
  r = await req('GET', `${API}/m68/status`, null, TOKEN);
  check('status with device', r.body.data?.devices?.length === 1, `len=${r.body.data?.devices?.length}`);
  check('status listener.port=15005', r.body.data?.listener?.port === 15005, `got ${r.body.data?.listener?.port}`);

  console.log('\n=== DELETE /m68/devices/:id ===');
  r = await req('DELETE', `${API}/m68/devices/${deviceId}`, null, TOKEN);
  check('delete 200', r.status === 200, `got ${r.status}`);
  check('delete returns id', r.body.data?.id === deviceId, `got ${r.body.data?.id}`);

  r = await req('GET', `${API}/m68/devices`, null, TOKEN);
  check('list after delete: 0 devices', r.body.data?.length === 0, `len=${r.body.data?.length}`);

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
}

run().then(() => {
  server.close();
  licenseStub.close();
  // Close SQLite before cleanup (Windows locks the file while open)
  try {
    const { closeDb } = require(path.join(__dirname, '..', 'EDGE', 'backend', 'config', 'database'));
    closeDb();
  } catch {}
  setTimeout(() => {
    try { fs.rmSync(TMPDIR, { recursive: true, force: true }); } catch {}
    process.exit(failed > 0 ? 1 : 0);
  }, 200);
}).catch(e => {
  console.error('E2E error:', e.message);
  server.close();
  licenseStub.close();
  setTimeout(() => {
    try { fs.rmSync(TMPDIR, { recursive: true, force: true }); } catch {}
    process.exit(1);
  }, 200);
});
