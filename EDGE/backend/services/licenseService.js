'use strict';
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execSync } = require('child_process');
const { randomUUID } = require('crypto');
const jwt  = require('jsonwebtoken');
const { STORAGE_BASE, STORAGE_DIR } = require('../config/app');
const { LICENSE_PUBLIC_KEY } = require('../config/licensePublicKey');

// ── Config ────────────────────────────────────────────────────────────────────
const LICENSE_FILE   = path.join(STORAGE_BASE, 'license.json');
const ANNOUNCEMENT_FILE = path.join(STORAGE_BASE, 'announcement.json');
const MACHINE_ID_FILE = path.join(STORAGE_DIR, 'machine-id.txt');
const API_BASE = process.env.EDGE_LICENSE_API || 'https://iotsoft.in/api/edgefolio';
const APP_VERSION = require('../../package.json').version || '1.0.0';

// Expiry warning threshold in days
const EXPIRING_DAYS = 15;

// Cache TTL — recompute state after 10 minutes so an expired license flips
// to grace/readonly without requiring a restart.
const CACHE_TTL_MS = 10 * 60 * 1000;

// Module-level cache — invalidated on activate/heartbeat, or when TTL expires.
// Shape: { state, claims, machineId, ... } or null
let _cachedState = null;
// Timestamp (Date.now()) when the cache was last populated
let _cacheAt = 0;

// ── Machine fingerprint ───────────────────────────────────────────────────────
function getMachineId() {
  // Try Windows MachineGuid (stable across software reinstalls)
  try {
    const out = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }
    );
    const match = out.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i);
    if (match && match[1].trim()) return match[1].trim();
  } catch { /* not Windows or reg failed */ }

  // Fallback: persisted random GUID in STORAGE_DIR
  try {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
    if (fs.existsSync(MACHINE_ID_FILE)) {
      const id = fs.readFileSync(MACHINE_ID_FILE, 'utf8').trim();
      if (id) return id;
    }
    const id = randomUUID();
    fs.writeFileSync(MACHINE_ID_FILE, id, { mode: 0o600 });
    return id;
  } catch (err) {
    // Last resort: hostname + cpu model (less stable)
    return `${os.hostname()}-${(os.cpus()[0]?.model || 'unknown').replace(/\s+/g, '-')}`;
  }
}

// Cache so we don't call reg every request
let _machineId = null;
function getCachedMachineId() {
  if (!_machineId) _machineId = getMachineId();
  return _machineId;
}

// ── License state computation ─────────────────────────────────────────────────
// Returns: { state, claims, machineId, error? }
// state: 'unlicensed' | 'valid' | 'expiring' | 'grace' | 'readonly' | 'blocked'
// Set cache and stamp the timestamp together so they are never out of sync.
function setCache(value) {
  _cachedState = value;
  _cacheAt = Date.now();
  return value;
}

function getLicenseState() {
  // Return cached value only if it is still within TTL
  if (_cachedState && (Date.now() - _cacheAt) < CACHE_TTL_MS) return _cachedState;

  const machineId = getCachedMachineId();
  const noLicense = { state: 'unlicensed', claims: null, machineId };

  if (!fs.existsSync(LICENSE_FILE)) return setCache(noLicense);

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8'));
  } catch {
    return setCache(noLicense);
  }

  const token = raw?.license;
  if (!token) return setCache(noLicense);

  let claims;
  try {
    // Verify RS256 signature — if tampered, verify throws
    claims = jwt.verify(token, LICENSE_PUBLIC_KEY, { algorithms: ['RS256'] });
  } catch {
    return setCache(noLicense);
  }

  // Machine binding check
  if (claims.machineId && claims.machineId !== machineId) {
    return setCache({ state: 'unlicensed', claims: null, machineId,
      error: 'License is bound to a different machine.' });
  }

  // Blocked status from claim
  if (claims.status === 'blocked') {
    return setCache({ state: 'blocked', claims, machineId });
  }

  // Compute state from claims (not JWT exp — JWT exp is 400d safety net)
  const now = Date.now();
  const expiresAt = new Date(claims.expiresAt).getTime();
  const graceDays = typeof claims.graceDays === 'number' ? claims.graceDays : 15;
  const graceEnd = expiresAt + graceDays * 24 * 60 * 60 * 1000;
  const daysLeft = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));

  let state;
  if (now > graceEnd) {
    state = 'readonly';
  } else if (now > expiresAt) {
    state = 'grace';
  } else if (daysLeft <= EXPIRING_DAYS) {
    state = 'expiring';
  } else {
    state = 'valid';
  }

  return setCache({ state, claims, machineId, daysLeft: Math.max(0, daysLeft) });
}

function invalidateCache() {
  _cachedState = null;
  _cacheAt = 0;
}

// ── Storage ───────────────────────────────────────────────────────────────────
function saveLicense(licenseJwt) {
  fs.mkdirSync(STORAGE_BASE, { recursive: true });
  fs.writeFileSync(LICENSE_FILE, JSON.stringify({ license: licenseJwt }, null, 2));
  invalidateCache();
}

// Announcement delivered via the heartbeat response — not signed/verified like the
// license (it's informational only, never gates anything), so a plain JSON cache is fine.
function saveAnnouncement(announcement) {
  fs.mkdirSync(STORAGE_BASE, { recursive: true });
  if (announcement) {
    fs.writeFileSync(ANNOUNCEMENT_FILE, JSON.stringify(announcement, null, 2));
  } else if (fs.existsSync(ANNOUNCEMENT_FILE)) {
    fs.unlinkSync(ANNOUNCEMENT_FILE);
  }
}

function getAnnouncement() {
  try {
    if (!fs.existsSync(ANNOUNCEMENT_FILE)) return null;
    return JSON.parse(fs.readFileSync(ANNOUNCEMENT_FILE, 'utf8'));
  } catch {
    return null;
  }
}

// ── Network helpers (never throw — always return { ok, ... } or { ok:false, error }) ──
async function apiPost(path_, body) {
  try {
    const res = await fetch(`${API_BASE}${path_}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, error: data.error || data.message || `HTTP ${res.status}` };
    }
    return { ok: true, ...data };
  } catch (err) {
    if (err.name === 'TimeoutError' || err.code === 'ECONNREFUSED' || err.name === 'FetchError') {
      return { ok: false, error: 'Internet connection required for activation. Please check your connection.' };
    }
    return { ok: false, error: err.message || 'Network error' };
  }
}

// ── activate(licenseKey) ──────────────────────────────────────────────────────
async function activate(licenseKey) {
  const machineId = getCachedMachineId();
  const result = await apiPost('/activate', { licenseKey, machineId, appVersion: APP_VERSION });
  if (!result.ok) return result;
  if (!result.license) return { ok: false, error: 'Invalid server response: missing license' };
  saveLicense(result.license);
  return { ok: true, state: getLicenseState() };
}

// ── signupTrial(form) ─────────────────────────────────────────────────────────
async function signupTrial(form) {
  const result = await apiPost('/signup', {
    companyName: form.companyName,
    contactName: form.contactName,
    phone: form.phone,
    email: form.email,
  });
  if (!result.ok) return result;
  const { licenseKey, expiresAt, maxEmployees } = result;
  if (!licenseKey) return { ok: false, error: 'Invalid server response: missing licenseKey' };
  // Auto-activate with the returned key
  const activateResult = await activate(licenseKey);
  return { ok: activateResult.ok, licenseKey, expiresAt, maxEmployees,
    error: activateResult.error, state: activateResult.state };
}

// ── heartbeat() ───────────────────────────────────────────────────────────────
async function heartbeat() {
  const { state, claims, machineId } = getLicenseState();
  if (state === 'unlicensed' || !claims) return { ok: false, error: 'No valid license for heartbeat' };

  // Count active employees from DB
  let activeEmployees = 0;
  try {
    const { getDb } = require('../config/database');
    const row = getDb().prepare("SELECT COUNT(*) AS n FROM employees WHERE status = 'active'").get();
    activeEmployees = Number(row?.n || 0);
  } catch { /* DB might not exist yet */ }

  // Determine lastPayrollRun from payroll_runs table if it exists
  let lastPayrollRun = null;
  try {
    const { getDb } = require('../config/database');
    const row = getDb().prepare(
      "SELECT MAX(created_at) AS last FROM payroll_runs"
    ).get();
    lastPayrollRun = row?.last || null;
  } catch { /* table may not exist */ }

  const result = await apiPost('/heartbeat', {
    licenseKey: claims.licenseKey,
    machineId,
    activeEmployees,
    appVersion: APP_VERSION,
    lastPayrollRun,
  });

  if (result.ok && result.license) {
    saveLicense(result.license);
  }
  // announcement is always present (object or explicit null) on a successful heartbeat —
  // save it either way so a cleared announcement actually clears locally too.
  if (result.ok && 'announcement' in result) {
    saveAnnouncement(result.announcement);
  }

  return result;
}

// ── getActiveEmployeeCount() ──────────────────────────────────────────────────
function getActiveEmployeeCount() {
  try {
    const { getDb } = require('../config/database');
    const row = getDb().prepare("SELECT COUNT(*) AS n FROM employees WHERE status = 'active'").get();
    return Number(row?.n || 0);
  } catch {
    return 0;
  }
}

module.exports = {
  getLicenseState,
  activate,
  signupTrial,
  heartbeat,
  getCachedMachineId,
  getActiveEmployeeCount,
  invalidateCache,
  getAnnouncement,
};
