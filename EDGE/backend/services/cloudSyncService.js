'use strict';
/**
 * EdgeFolio Cloud sync (CLOUD_ATTENDANCE_PLAN.md §6, Phase 3). EDGE only calls OUT:
 *
 *   connect()  → POST {cloud}/sync/connect with this PC's licence key + machine id
 *                → company code (employees type it in the app) + a private sync key
 *   runSync()  → push employees (EDGE owns the master) and reference data (company name, weekly
 *                offs, holidays, office locations, office hours + shifts) when they changed, then pull new phone punches
 *                and commit them into attendance through the Machine Import pipeline.
 *
 * Everything is stored in app_preferences (cloud_*). The sync key never leaves this PC except to
 * the cloud. Failures never throw out of runSync — they are recorded for the settings screen.
 */
const crypto = require('crypto');
const { getDb } = require('../config/database');
const { stageRecords, commitMappedRecords } = require('../models/machineImportModel');
const logger = require('../utils/logger');

const DEFAULT_BASE_URL = 'https://edgefolio.iotsoft.in/cloud/api/v1';
const APP_VERSION = require('../../package.json').version || '1.0.0';
const FULL_PUSH_EVERY_MS = 6 * 60 * 60 * 1000;   // re-send employees at least every 6 h even if unchanged
const PAGE = 500;

let inFlight = null;

// ── preferences ───────────────────────────────────────────────────────────────
function getPref(key, fallback = null) {
  try { return getDb().prepare('SELECT value FROM app_preferences WHERE key = ?').get(key)?.value ?? fallback; }
  catch { return fallback; }
}
function setPref(key, value) {
  getDb().prepare(`INSERT INTO app_preferences (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
                   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`)
    .run(key, value == null ? '' : String(value));
}
function delPref(key) { getDb().prepare('DELETE FROM app_preferences WHERE key = ?').run(key); }

function baseUrl() { return (getPref('cloud_base_url') || DEFAULT_BASE_URL).replace(/\/+$/, ''); }

// ── HTTP ──────────────────────────────────────────────────────────────────────
async function call(method, path, body, { key } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (key) headers['x-sync-key'] = key;
  let res;
  try {
    res = await fetch(`${baseUrl()}/sync${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  } catch (e) {
    const err = new Error(`Cloud not reachable (${e.name === 'TimeoutError' ? 'timeout' : e.message})`);
    err.offline = true;
    throw err;
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    const err = new Error(json.message || json.error || `Cloud error HTTP ${res.status}`);
    err.status = res.status;
    err.code = json.error;
    throw err;
  }
  return json.data;
}

// ── data EDGE sends ───────────────────────────────────────────────────────────
function readEmployees() {
  return getDb().prepare(
    `SELECT e.id AS empId, e.emp_code AS empCode, e.name, e.email, e.department, e.designation,
            e.app_role AS appRole, e.mobile_login_enabled AS mobileLoginEnabled,
            e.is_field_employee AS isFieldEmployee, e.status, e.shift_id AS shiftId,
            u.password_hash AS passwordHash, u.temp_password_hash AS tempPasswordHash,
            u.password_must_change AS passwordMustChange
     FROM employees e
     LEFT JOIN users u ON e.email IS NOT NULL AND LOWER(u.email) = LOWER(e.email)
     WHERE e.emp_code IS NOT NULL AND e.emp_code != ''`,
  ).all().map((r) => ({ ...r, mobileLoginEnabled: Boolean(r.mobileLoginEnabled), isFieldEmployee: Boolean(r.isFieldEmployee), passwordMustChange: Boolean(r.passwordMustChange) }));
}

// Office locations live in app_preferences office_<id> as JSON — the same keys EDGE's own APK
// /apk/offices endpoint reads, so phones on the LAN and in the cloud see the same offices.
function readOffices() {
  return getDb().prepare("SELECT value FROM app_preferences WHERE key LIKE 'office\\_%' ESCAPE '\\'").all()
    .map((r) => { try { return JSON.parse(r.value); } catch { return null; } })
    .filter((o) => o && o.id && o.label);
}

function readReference() {
  const db = getDb();
  let weeklyOffDays = [0, 6];
  try { weeklyOffDays = JSON.parse(db.prepare('SELECT weekly_off_days FROM working_hours WHERE id = 1').get()?.weekly_off_days || '[0,6]'); } catch { /* default */ }
  const companyName = db.prepare('SELECT company_name FROM company_settings WHERE id = 1').get()?.company_name || null;
  const holidays = db.prepare('SELECT date, name FROM holidays ORDER BY date').all();
  // Shifts: EDGE is the master for PC-linked companies; the app shows them read-only.
  const wh = db.prepare('SELECT start_time, end_time, break_duration FROM working_hours WHERE id = 1').get();
  const workingHours = wh ? { start: wh.start_time, end: wh.end_time, breakMinutes: Number(wh.break_duration ?? 60) } : null;
  const shifts = db.prepare('SELECT * FROM shifts ORDER BY shift_id').all().map((r) => ({
    id: r.shift_id, name: r.shift_name, start: r.start_time, end: r.end_time,
    breakMinutes: Number(r.break_duration || 0), graceMinutes: Number(r.grace_minutes ?? 10),
  }));
  return { companyName, weeklyOffDays, holidays, offices: readOffices(), enforceGeofence: getPref('cloud_enforce_geofence') === '1', workingHours, shifts };
}

const hashOf = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

// ── public API ────────────────────────────────────────────────────────────────
function getStatus() {
  let lastResult = null;
  try { lastResult = JSON.parse(getPref('cloud_last_result') || 'null'); } catch { /* ignore */ }
  return {
    enabled: getPref('cloud_sync_enabled') === '1',
    connected: Boolean(getPref('cloud_sync_key')),
    orgCode: getPref('cloud_org_code'),
    companyName: getPref('cloud_company_name'),
    baseUrl: baseUrl(),
    appUrl: baseUrl(),                      // what phones use in Cloud mode (they add the company code)
    cursor: Number(getPref('cloud_cursor', '0')),
    lastSyncAt: getPref('cloud_last_sync_at'),
    lastError: getPref('cloud_last_error') || null,
    lastResult,
    enforceGeofence: getPref('cloud_enforce_geofence') === '1',
    offices: readOffices(),
  };
}

async function connect({ baseUrlOverride } = {}) {
  if (baseUrlOverride) setPref('cloud_base_url', baseUrlOverride.replace(/\/+$/, ''));
  const { getLicenseState } = require('./licenseService');
  const { claims, machineId } = getLicenseState();
  if (!claims?.licenseKey) throw Object.assign(new Error('EdgeFolio is not activated on this PC — activate the free licence first.'), { status: 400 });
  const ref = readReference();
  const data = await call('POST', '/connect', {
    licenseKey: claims.licenseKey, machineId, companyName: ref.companyName, edgeVersion: APP_VERSION, tzOffsetMin: 330,
  });
  setPref('cloud_org_code', data.orgCode);
  setPref('cloud_company_name', data.companyName || ref.companyName || '');
  setPref('cloud_sync_key', data.syncKey);
  setPref('cloud_sync_enabled', '1');
  setPref('cloud_cursor', '0');
  delPref('cloud_employees_hash'); delPref('cloud_reference_hash'); delPref('cloud_employees_pushed_at');
  logger.info('Cloud sync connected', { channel: 'cloud', orgCode: data.orgCode, created: data.created });
  await runSync('connect');
  return getStatus();
}

function disconnect() {
  // Keeps the company code for reference; the cloud keeps the data. Reconnecting from this PC
  // later gets a new key for the same company.
  setPref('cloud_sync_enabled', '0');
  delPref('cloud_sync_key');
  logger.info('Cloud sync disconnected', { channel: 'cloud' });
  return getStatus();
}

function saveOffices(offices, enforceGeofence) {
  const db = getDb();
  db.prepare("DELETE FROM app_preferences WHERE key LIKE 'office\\_%' ESCAPE '\\'").run();
  for (const o of offices || []) {
    const id = String(o.id || o.label || '').trim().replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 40);
    if (!id || !o.label) continue;
    const lat = o.lat === '' || o.lat == null ? null : Number(o.lat);
    const lng = o.lng === '' || o.lng == null ? null : Number(o.lng);
    const radiusM = o.radiusM === '' || o.radiusM == null ? null : Number(o.radiusM);
    setPref(`office_${id}`, JSON.stringify({ id, label: String(o.label).slice(0, 80), lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null, radiusM: Number.isFinite(radiusM) ? radiusM : null }));
  }
  if (typeof enforceGeofence === 'boolean') setPref('cloud_enforce_geofence', enforceGeofence ? '1' : '0');
  delPref('cloud_reference_hash');   // push on next sync
  return getStatus();
}

/** One sync cycle. Never throws; returns { ok, ... } and records it for the settings screen. */
function runSync(trigger = 'interval') {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const key = getPref('cloud_sync_key');
    if (getPref('cloud_sync_enabled') !== '1' || !key) return { ok: false, skipped: 'not connected' };
    const result = { ok: true, trigger, employees: null, reference: null, punches: 0, committed: 0 };
    try {
      // 1. Employees — when changed, or every 6 h as a safety net.
      const emps = readEmployees();
      const eh = hashOf(emps);
      const pushedAt = Number(getPref('cloud_employees_pushed_at', '0'));
      if (eh !== getPref('cloud_employees_hash') || Date.now() - pushedAt > FULL_PUSH_EVERY_MS) {
        result.employees = await call('PUT', '/employees', { employees: emps }, { key });
        setPref('cloud_employees_hash', eh); setPref('cloud_employees_pushed_at', String(Date.now()));
      }
      // 2. Reference data — when changed.
      const ref = readReference();
      const rh = hashOf(ref);
      if (rh !== getPref('cloud_reference_hash')) {
        result.reference = await call('PUT', '/reference', ref, { key });
        setPref('cloud_reference_hash', rh);
      }
      // 3. Punches — page by page from the saved cursor; cursor saved after each committed page.
      let cursor = Number(getPref('cloud_cursor', '0'));
      const known = new Set(getDb().prepare('SELECT id FROM employees').all().map((r) => r.id));
      for (let pages = 0; pages < 50; pages++) {
        const page = await call('GET', `/punches?after=${cursor}&limit=${PAGE}`, null, { key });
        if (!page.punches.length) break;
        const today = new Date().toISOString().slice(0, 10);
        const batchId = `CLOUD-APP-${today}`;
        stageRecords(batchId, 'cloud_app', page.punches.map((p) => ({
          machineEmpId: known.has(p.empId) ? p.empId : `cloud:${p.empId}`,
          mappedEmployeeId: known.has(p.empId) ? p.empId : null,
          punchDate: p.date, punchTime: p.time,
          // cloud sends the shift's start date for night shifts; commit falls back to shiftDay when absent
          workDate: p.workDate || null,
          direction: p.eventType === 'out' ? 'out' : 'in',
          mode: `cloud-${p.workType || 'app'}`,
          remark: p.geofenceOk === false ? 'outside-geofence' : null,
          recordType: 'punch',
          deviceData: { seq: p.seq, source: p.source, faceMatch: p.faceMatch, location: p.location },
        })));
        const c = commitMappedRecords(batchId);
        result.committed += c.committed || 0;
        result.punches += page.punches.length;
        cursor = page.nextCursor;
        setPref('cloud_cursor', String(cursor));
        await call('POST', '/ack', { cursor }, { key });
        if (!page.hasMore) break;
      }
      setPref('cloud_last_error', '');
    } catch (e) {
      result.ok = false;
      result.error = e.message;
      const msg = e.status === 401 ? 'The cloud no longer accepts this PC\'s sync key — press Reconnect.' : e.message;
      setPref('cloud_last_error', msg);
      if (!e.offline) logger.warn('Cloud sync failed', { channel: 'cloud', trigger, reason: e.message });
    }
    setPref('cloud_last_sync_at', new Date().toISOString());
    setPref('cloud_last_result', JSON.stringify(result));
    return result;
  })().finally(() => { inFlight = null; });
  return inFlight;
}

module.exports = { getStatus, connect, disconnect, runSync, saveOffices, readEmployees, readReference, DEFAULT_BASE_URL };
