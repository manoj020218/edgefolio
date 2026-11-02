'use strict';
/**
 * U5 Visitor auto-ID — turns an unknown face at a U5 marked as a *visitor machine*
 * (u5_devices.visitor_auto_enroll = 1) into a temporary ID, with no enrollment form.
 *
 *   stranger in the U5 log (userid "-1", "陌生人") -> its snapshot is enrolled via
 *   /insertEmployee as e.g. "TW-1001" -> next visit the U5 recognises them (green box)
 *   -> the normal HTTP poll stages the punch under "TW-1001" (see u5MachineService).
 *
 * Ported from the demo script U5_VISITOR/u5-visitor-auto-enroll.js (rehearsed live
 * 2026-11-01). Same one-ID-per-walk-up rules:
 *   - stranger records within BURST_S of each other are one sighting; largest photo wins;
 *   - a stranger record within MATCH_WINDOW_S of a recognised punch is ignored
 *     (first frame at an angle, just before the match);
 *   - COOLDOWN_S after an enroll, further strangers are ignored;
 *   - the U5's own duplicate check (code 12) stops a second ID for the same face.
 *
 * ID format comes from app_preferences (Settings -> U5 Machines -> Visitor auto-ID):
 *   u5_visitor_prefix ("V"), u5_visitor_digits (4), u5_visitor_next (1),
 *   u5_visitor_name_pattern ("Temp {id}"; {id} = full ID, {n} = padded number; the U5
 *   accepts 10 characters at most, longer names are cut).
 *
 * All device calls happen inside u5MachineService's per-device lock, so they never overlap
 * the regular poll (the U5's HTTP server is single-threaded).
 */
const fs = require('fs');
const path = require('path');
const { getDb } = require('../config/database');
const { FACES_DIR } = require('../config/app');

const BURST_S = 8;
const MATCH_WINDOW_S = 10;
const COOLDOWN_S = 20;
const SETTLE_S = 6;
const VISITOR_PHOTO_DIR = path.join(FACES_DIR, 'visitors');

// deviceSn -> { seen:Set, pending:[{row, firstSeenMs}], lastEnrollDev:number, baselined:boolean }
const _state = {};

function stateFor(sn) {
  if (!_state[sn]) _state[sn] = { seen: new Set(), pending: [], lastEnrollDev: 0, baselined: false };
  return _state[sn];
}

/** Forget in-memory progress for a device (e.g. visitor mode switched off). */
function resetDevice(sn) { delete _state[sn]; }

// ── ID format ────────────────────────────────────────────────────────────────
function readFormat(getPref) {
  const digits = Math.min(Math.max(parseInt(getPref('u5_visitor_digits', '4'), 10) || 4, 3), 6);
  const next = Math.max(parseInt(getPref('u5_visitor_next', '1'), 10) || 1, 1);
  return {
    prefix: String(getPref('u5_visitor_prefix', 'V') ?? 'V').trim().slice(0, 10),
    digits,
    next,
    namePattern: String(getPref('u5_visitor_name_pattern', 'Temp {id}') || 'Temp {id}'),
  };
}

function formatId(fmt, number) {
  const n = String(number).padStart(fmt.digits, '0');
  const code = `${fmt.prefix}${n}`;
  const name = fmt.namePattern.replace(/\{id\}/g, code).replace(/\{n\}/g, n).trim().slice(0, 10) || code.slice(0, 10);
  return { code, name };
}

// ── helpers ──────────────────────────────────────────────────────────────────
// Device timestamps are "YYYY-MM-DD HH:MM:SS" on the device clock; parse "as UTC" and only
// compare them with each other or with "device now" derived from the configured offset.
function devSec(t) { return Date.parse(String(t).replace(' ', 'T') + 'Z') / 1000; }
function rowKey(r) { return `${r.checkin_time}|${String(r.pic_large || '').length}`; }
function photoB64(r) { return String(r.pic_large || '').replace(/^data:image\/\w+;base64,/, ''); }

function saveVisitorPhoto(code, b64) {
  try {
    fs.mkdirSync(VISITOR_PHOTO_DIR, { recursive: true });
    const file = `${code.replace(/[^A-Za-z0-9_-]/g, '_')}.jpg`;
    fs.writeFileSync(path.join(VISITOR_PHOTO_DIR, file), Buffer.from(b64, 'base64'));
    return file;
  } catch { return null; }
}

function readVisitorPhoto(file) {
  if (!file) return null;
  const full = path.resolve(VISITOR_PHOTO_DIR, String(file));
  if (!full.startsWith(path.resolve(VISITOR_PHOTO_DIR) + path.sep)) return null;
  try { return fs.readFileSync(full); } catch { return null; }
}

/** machine userid -> visitor code, for the poll to stage punches under the custom ID. */
function visitorCodeMap(sn) {
  const map = {};
  try {
    getDb().prepare('SELECT machine_user_id, visitor_code FROM u5_visitors WHERE device_sn = ? AND machine_user_id IS NOT NULL')
      .all(sn).forEach((v) => { map[String(v.machine_user_id)] = v.visitor_code; });
  } catch { /* table missing on a very old DB — no visitors */ }
  return map;
}

// ── the check ────────────────────────────────────────────────────────────────
/**
 * One visitor check for one device. Call only while holding the device lock.
 * @param device   u5_devices row
 * @param adapter  U5Adapter for that device
 * @param opts     { getPref, setPref, log }
 */
async function runVisitorCheck(device, adapter, { getPref, setPref, log = console.log }) {
  const sn = device.device_sn;
  const st = stateFor(sn);

  const strangersRes = await adapter.getRecentLogs(1);
  if (!strangersRes.success) return;
  const strangers = strangersRes.data;

  if (!st.baselined) {           // everything already in the log when we start is history
    strangers.forEach((r) => st.seen.add(rowKey(r)));
    st.baselined = true;
    log(`[U5-VISITOR] ${sn}: visitor auto-ID active (ignoring ${strangers.length} older stranger records)`);
    await adoptExistingVisitors(device, adapter, { getPref, log });
    return;
  }

  for (const r of strangers) {
    const k = rowKey(r);
    if (st.seen.has(k)) continue;
    st.seen.add(k);
    st.pending.push({ row: r, firstSeenMs: Date.now() });
  }
  if (st.seen.size > 500) st.seen = new Set([...st.seen].slice(-200));   // bounded memory
  if (!st.pending.length) return;

  // Act on the oldest stranger once it has settled (a recognised punch often follows it).
  const deviceOffsetMin = Number(getPref('u5_device_utc_offset', '480'));
  const deviceNowSec = Date.now() / 1000 + deviceOffsetMin * 60;
  st.pending.sort((a, b) => devSec(a.row.checkin_time) - devSec(b.row.checkin_time));
  const oldest = st.pending[0];
  const settled = deviceNowSec - devSec(oldest.row.checkin_time) >= SETTLE_S
    || Date.now() - oldest.firstSeenMs >= SETTLE_S * 1000;
  if (!settled) return;

  const t0 = devSec(oldest.row.checkin_time);
  const burst = st.pending.filter((p) => devSec(p.row.checkin_time) - t0 <= BURST_S);
  st.pending = st.pending.filter((p) => !burst.includes(p));

  if (t0 - st.lastEnrollDev < COOLDOWN_S) {
    log(`[U5-VISITOR] ${sn}: ignored ${burst.length} stranger record(s) — within ${COOLDOWN_S}s of the last enroll`);
    return;
  }
  const matchesRes = await adapter.getRecentLogs(2);
  const near = matchesRes.success
    ? matchesRes.data.find((m) => Math.abs(devSec(m.checkin_time) - t0) <= MATCH_WINDOW_S)
    : null;
  if (near) {
    log(`[U5-VISITOR] ${sn}: ignored ${burst.length} stranger record(s) — ${near.name} was recognised at ${near.checkin_time}`);
    return;
  }

  st.lastEnrollDev = t0;
  const best = burst.map((p) => p.row).sort((a, b) => photoB64(b).length - photoB64(a).length)[0];
  await enrollStranger(device, adapter, best, { getPref, setPref, log });
}

/**
 * People already enrolled on this machine whose id_number matches the visitor format
 * (current prefix + digits, e.g. "V0001" made by the old demo script) are adopted as
 * visitors: their machine face crop becomes the visitor photo and their earlier staged
 * punches are relabelled from the U5 userid to the visitor code. Links HR made to the
 * userid are carried over by the poll (u5MachineService.carryOverVisitorMappings).
 */
async function adoptExistingVisitors(device, adapter, { getPref, log }) {
  const sn = device.device_sn;
  const fmt = readFormat(getPref);
  if (!fmt.prefix) return;   // without a prefix every numeric staff code would match
  const escaped = fmt.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}\\d+$`);
  const list = await adapter.getEmployeeList();
  if (!list.success) return;
  const db = getDb();
  const known = db.prepare('SELECT 1 FROM u5_visitors WHERE visitor_code = ?');
  const insert = db.prepare(`INSERT INTO u5_visitors (device_sn, visitor_code, machine_user_id, display_name, photo_path)
                             VALUES (?, ?, ?, ?, ?)`);
  const relabel = db.prepare(`UPDATE machine_import_staging SET machine_emp_id = ?
                              WHERE machine_emp_id = ? AND source_type = 'u5_face'`);
  for (const e of list.data) {
    const code = String(e.id_number || '');
    if (!pattern.test(code) || known.get(code)) continue;
    const b64 = String(e.pic_large || '').replace(/^data:image\/\w+;base64,/, '');
    const photo = b64.length > 1000 ? saveVisitorPhoto(code, b64) : null;
    insert.run(sn, code, String(e.userId), e.name || code, photo);
    const moved = relabel.run(code, String(e.userId)).changes;
    log(`[U5-VISITOR] ${sn}: adopted existing visitor ${code} (machine userid ${e.userId}, ${moved} earlier punch(es) relabelled)`);
  }
}

async function enrollStranger(device, adapter, row, { getPref, setPref, log }) {
  const sn = device.device_sn;
  const b64 = photoB64(row);
  if (b64.length < 2000) { log(`[U5-VISITOR] ${sn}: stranger record has no usable photo — skipped`); return; }

  const db = getDb();
  const fmt = readFormat(getPref);
  // Skip numbers already used (e.g. "next number" was set back in Settings).
  let number = fmt.next;
  const used = db.prepare('SELECT 1 FROM u5_visitors WHERE visitor_code = ?');
  while (used.get(formatId(fmt, number).code)) number++;
  const { code, name } = formatId(fmt, number);

  const res = await adapter.enrollFace({ idNumber: code, name, picLarge: 'data:image/jpeg;base64,' + b64 });
  if (!res.success) {
    if (res.code === 12) log(`[U5-VISITOR] ${sn}: face already enrolled (code 12) — no new ID`);
    else log(`[U5-VISITOR] ${sn}: U5 rejected the photo (code ${res.code}) — face probably too small/unclear, will try on the next sighting`);
    return;
  }

  // The U5's own userid is what its log reports; look it up so punches can be staged as `code`.
  let userId = res.userId ? String(res.userId) : null;
  if (!userId) {
    const list = await adapter.getEmployeeList();
    const me = list.success ? list.data.find((e) => String(e.id_number) === code) : null;
    if (me) userId = String(me.userId);
  }

  db.prepare(`INSERT INTO u5_visitors (device_sn, visitor_code, machine_user_id, display_name, photo_path, first_seen)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .run(sn, code, userId, name, saveVisitorPhoto(code, b64), row.checkin_time || null);
  setPref('u5_visitor_next', String(number + 1));
  log(`[U5-VISITOR] ${sn}: ENROLLED ${code} ("${name}"), machine userid ${userId || '?'}`);
}

// ── read side (Visitors screen) ──────────────────────────────────────────────
function listVisitors() {
  const monthStart = new Date().toISOString().slice(0, 8) + '01';
  return getDb().prepare(`
    SELECT v.visitor_code AS code, v.display_name AS name, v.device_sn AS deviceSn,
           v.machine_user_id AS machineUserId, v.first_seen AS firstSeenDevice,
           v.enrolled_at AS enrolledAt, (v.photo_path IS NOT NULL) AS hasPhoto,
           (SELECT MIN(s.punch_date) FROM machine_import_staging s WHERE s.machine_emp_id = v.visitor_code) AS firstPunchDate,
           (SELECT MAX(s.punch_date || ' ' || IFNULL(s.punch_time, '')) FROM machine_import_staging s WHERE s.machine_emp_id = v.visitor_code) AS lastPunch,
           (SELECT COUNT(DISTINCT s.punch_date) FROM machine_import_staging s WHERE s.machine_emp_id = v.visitor_code AND s.punch_date >= ?) AS daysThisMonth,
           (SELECT COUNT(DISTINCT s.punch_date) FROM machine_import_staging s WHERE s.machine_emp_id = v.visitor_code) AS daysTotal,
           (SELECT s.id FROM machine_import_staging s WHERE s.machine_emp_id = v.visitor_code AND s.photo_path IS NOT NULL
             ORDER BY s.punch_date DESC, s.punch_time DESC LIMIT 1) AS latestPhotoId,
           (SELECT e.name FROM machine_id_mappings m JOIN employees e ON e.id = m.employee_id
             WHERE m.machine_emp_id = v.visitor_code) AS linkedEmployee
    FROM u5_visitors v
    ORDER BY v.enrolled_at DESC
  `).all(monthStart).map((r) => ({ ...r, hasPhoto: !!r.hasPhoto }));
}

function getVisitorPhoto(code) {
  const row = getDb().prepare('SELECT photo_path FROM u5_visitors WHERE visitor_code = ?').get(String(code));
  return row ? readVisitorPhoto(row.photo_path) : null;
}

module.exports = {
  runVisitorCheck, resetDevice, visitorCodeMap, listVisitors, getVisitorPhoto,
  readFormat, formatId,
};
