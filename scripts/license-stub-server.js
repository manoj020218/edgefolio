/**
 * Stub VPS license server for local verification of EDGE licensing.
 * Uses the REAL RS256 private key from billing-server/keys/.
 * Run with:
 *   node scripts/license-stub-server.js
 * Then test EDGE backend with:
 *   EDGE_LICENSE_API=http://127.0.0.1:39999 EDGEFOLIO_STORAGE_PATH=<tmpdir>
 *
 * Supports special licenseKey suffixes for test scenarios:
 *   EF-TEST-GOOD-0000-0001 → valid license (180d)
 *   EF-TEST-EXPR-0000-0002 → expired but within graceDays (status=active, expiresAt=yesterday)
 *   EF-TEST-ROAD-0000-0003 → readonly (expiresAt 20d ago, graceDays=15)
 *   EF-TEST-BLOC-0000-0004 → blocked
 *   EF-TEST-LMT1-0000-0005 → maxEmployees=1
 */

'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
// Resolve jsonwebtoken from EDGE/node_modules
const EDGE_MODULES = path.join(__dirname, '..', 'EDGE', 'node_modules');
const jwt  = require(path.join(EDGE_MODULES, 'jsonwebtoken'));
const { randomUUID } = require('crypto');

const PRIVATE_KEY_PATH = path.join(
  __dirname, '..', '..', '..', '..', 'Billing at IOT soft', 'billing-server', 'keys', 'edge-license-private.pem'
);
const PRIVATE_KEY = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');

const PORT = 39999;
const store = {}; // licenseKey → { machineId, licenseKey, ... }

function signLicense(claims) {
  return jwt.sign(claims, PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '400d' });
}

function buildClaims(licenseKey, machineId, overrides = {}) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
  return {
    licenseKey,
    clientId: 'test-client-001',
    plan: { name: 'Trial', maxEmployees: overrides.maxEmployees ?? 25 },
    status: overrides.status ?? 'trial',
    issuedAt: now.toISOString(),
    expiresAt: overrides.expiresAt ?? expiresAt.toISOString(),
    graceDays: overrides.graceDays ?? 15,
    machineId,
  };
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  const url = req.url.replace(/\?.*$/, '');
  const method = req.method.toUpperCase();
  const body = method === 'POST' ? await parseBody(req) : {};

  console.log(`[stub] ${method} ${url}`, body);

  // POST /signup
  if (method === 'POST' && url === '/signup') {
    const { companyName, contactName, phone, email } = body;
    if (!companyName || !contactName || !phone || !email) {
      return send(res, 400, { error: 'Missing required fields' });
    }
    const licenseKey = `EF-TEST-GOOD-${Date.now().toString().slice(-4)}-${Math.floor(Math.random()*9000+1000)}`;
    store[licenseKey] = { licenseKey, machineId: null, companyName };
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
    return send(res, 201, { licenseKey, expiresAt: expiresAt.toISOString(), maxEmployees: 25 });
  }

  // POST /activate
  if (method === 'POST' && url === '/activate') {
    const { licenseKey, machineId, appVersion } = body;
    if (!licenseKey || !machineId) return send(res, 400, { error: 'licenseKey and machineId required' });

    const key = licenseKey.toUpperCase();

    // Test scenario keys
    if (key.startsWith('EF-TEST-BLOC')) {
      const claims = buildClaims(key, machineId, { status: 'blocked' });
      store[key] = { licenseKey: key, machineId, appVersion };
      return send(res, 200, { license: signLicense(claims) });
    }
    if (key.startsWith('EF-TEST-EXPR')) {
      // Expired yesterday, within graceDays=15
      const expiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const claims = buildClaims(key, machineId, { status: 'active', expiresAt: expiresAt.toISOString(), graceDays: 15 });
      store[key] = { licenseKey: key, machineId, appVersion };
      return send(res, 200, { license: signLicense(claims) });
    }
    if (key.startsWith('EF-TEST-ROAD')) {
      // Expired 20d ago, graceDays=15 → readonly
      const expiresAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
      const claims = buildClaims(key, machineId, { status: 'active', expiresAt: expiresAt.toISOString(), graceDays: 15 });
      store[key] = { licenseKey: key, machineId, appVersion };
      return send(res, 200, { license: signLicense(claims) });
    }
    if (key.startsWith('EF-TEST-LMT1')) {
      const claims = buildClaims(key, machineId, { status: 'active', maxEmployees: 1 });
      store[key] = { licenseKey: key, machineId, appVersion };
      return send(res, 200, { license: signLicense(claims) });
    }

    // Normal key from /signup
    const existing = store[key];
    if (!existing) return send(res, 404, { error: 'License key not found' });
    if (existing.status === 'blocked') return send(res, 403, { error: 'License blocked' });
    if (existing.machineId && existing.machineId !== machineId) {
      return send(res, 409, { error: 'License already activated on another machine. Contact support.' });
    }
    existing.machineId = machineId;
    existing.appVersion = appVersion;

    const claims = buildClaims(key, machineId, { status: 'trial' });
    return send(res, 200, { license: signLicense(claims) });
  }

  // POST /heartbeat
  if (method === 'POST' && url === '/heartbeat') {
    const { licenseKey, machineId, activeEmployees, appVersion, lastPayrollRun } = body;
    if (!licenseKey || !machineId) return send(res, 400, { error: 'licenseKey and machineId required' });

    const key = licenseKey.toUpperCase();
    const existing = store[key];
    if (existing && existing.machineId && existing.machineId !== machineId) {
      return send(res, 403, { error: 'Machine mismatch' });
    }

    // Return fresh license on heartbeat
    const claims = buildClaims(key, machineId, { status: existing?.status ?? 'trial' });
    return send(res, 200, { ok: true, license: signLicense(claims) });
  }

  send(res, 404, { error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[stub] License stub server running at http://127.0.0.1:${PORT}`);
  console.log('[stub] Ready to test signup/activate/heartbeat');
});
