#!/usr/bin/env node
/**
 * U5 visitor / stranger probe — live-machine test tool (no dependencies, Node 18+).
 *
 * Goal: find out HOW the U5 face terminal reports a face that is NOT enrolled
 * ("unknown visitor"): which getWorkNoteList `type` returns it, what fields it
 * carries (visitor number? empty userid? ispass=0?), whether a photo comes with
 * it, and whether that photo can be re-enrolled via /insertEmployee.
 *
 * The device HTTP server is single-threaded: every call here is strictly serial.
 *
 * Commands:
 *   node u5-visitor-probe.js scan        one-shot: device info, enrolled list, every record type
 *   node u5-visitor-probe.js watch       poll every type, print NEW rows live (walk up as a stranger now)
 *   node u5-visitor-probe.js endpoints   try guessed stranger/visitor endpoints (read-only)
 *   node u5-visitor-probe.js enroll-test --photo <file.jpg> [--cleanup]
 *                                        WRITES to the device: enroll one saved stranger photo
 *
 * Options:
 *   --ip 192.168.1.92   --port 80   --password 123456
 *   --types 0,1,2,3,4,5,6           record types to try (2 = what production uses today)
 *   --interval 5                    watch: seconds between cycles
 *   --extra '{"page":1}'            extra JSON merged into every getWorkNoteList body
 *   --timeout 60                    per-request timeout, seconds (photo-laden responses are big)
 *   --id VPROBE01 --name TempProbe  enroll-test identity
 *   --pass-date 0 --pass-time 0     enroll-test validity fields, sent raw (format still unknown)
 *
 * Output goes to ./probe-output/<timestamp>/ — summaries as JSON, photos as .jpg.
 * probe-output/ is git-ignored: it contains photos of real people.
 */
'use strict';
const fs = require('fs');
const path = require('path');

// ---------- args ----------
const argv = process.argv.slice(2);
const cmd = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'scan';
function opt(name, def) {
  const i = argv.indexOf('--' + name);
  if (i === -1) return def;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}
const IP = opt('ip', process.env.U5_IP || '192.168.1.92');
const PORT = opt('port', '80');
const PASSWORD = String(opt('password', process.env.U5_PASSWORD || '123456'));
const TYPES = String(opt('types', '0,1,2,3,4,5,6')).split(',').map(s => Number(s.trim())).filter(n => !Number.isNaN(n));
const INTERVAL = Number(opt('interval', '5')) * 1000;
const TIMEOUT = Number(opt('timeout', '60')) * 1000;
const EXTRA = opt('extra', null) ? JSON.parse(opt('extra')) : {};
const BASE = `http://${IP}:${PORT}`;

const RUN_DIR = path.join(__dirname, 'probe-output', new Date().toISOString().replace(/[:.]/g, '-') + '-' + cmd);
fs.mkdirSync(RUN_DIR, { recursive: true });
const LOG_FILE = path.join(RUN_DIR, 'log.txt');
function log(...a) {
  const line = a.map(x => (typeof x === 'string' ? x : JSON.stringify(x, null, 2))).join(' ');
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}
function saveJson(name, obj) { fs.writeFileSync(path.join(RUN_DIR, name), JSON.stringify(obj, null, 2)); }

// ---------- device call ----------
async function post(endpoint, body, timeoutMs = TIMEOUT) {
  const t0 = Date.now();
  try {
    const res = await fetch(BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON reply */ }
    return { ok: res.ok, status: res.status, ms: Date.now() - t0, bytes: text.length, json, text: json ? null : text.slice(0, 300) };
  } catch (err) {
    return { ok: false, status: 0, ms: Date.now() - t0, bytes: 0, json: null, error: err.message };
  }
}

// ---------- row helpers ----------
const PHOTO_KEYS = ['pic_large', 'pic', 'photo', 'image', 'img', 'snap', 'pic_small', 'face'];
let photoCount = 0;

/** Copy of a row with photo fields replaced by a marker; optionally writes photos to disk. */
function stripRow(row, label, savePhotos) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'string' && v.length > 2000 && (PHOTO_KEYS.includes(k) || /^data:image|^\/9j\//.test(v))) {
      let file = null;
      if (savePhotos) {
        file = `${label}-${++photoCount}-${k}.jpg`;
        const b64 = v.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(path.join(RUN_DIR, file), Buffer.from(b64, 'base64'));
      }
      out[k] = `<${k}: ${v.length} chars${file ? ', saved ' + file : ''}>`;
    } else out[k] = v;
  }
  return out;
}
function rowKey(row) { return JSON.stringify(stripRow(row, '', false)); }

/** Heuristic: does this row look like an unknown / not-enrolled face? */
function looksUnknown(r) {
  const uid = r.userid ?? r.userId ?? r.employeeId;
  const reasons = [];
  if (uid === undefined || uid === '' || uid === 0 || uid === '0' || uid === -1 || uid === '-1') reasons.push('no userid');
  if (r.ispass === 0 || r.ispass === '0' || r.notePass === 0) reasons.push('ispass=0');
  const n = String(r.name ?? '');
  if (/陌生|stranger|visitor|unknown|访客/i.test(n)) reasons.push(`name="${n}"`);
  return reasons;
}

/** Field inventory: every key seen, and the distinct values of short fields. */
function inventory(rows) {
  const inv = {};
  for (const r of rows) for (const [k, v] of Object.entries(r)) {
    inv[k] ??= { count: 0, values: new Set() };
    inv[k].count++;
    if (inv[k].values.size < 15 && (typeof v !== 'string' || v.length < 60)) inv[k].values.add(JSON.stringify(v));
  }
  return Object.fromEntries(Object.entries(inv).map(([k, x]) => [k, { count: x.count, sampleValues: [...x.values] }]));
}

async function fetchType(type) {
  return post('/getWorkNoteList', { password: PASSWORD, type, ...EXTRA });
}
function rowsOf(r) {
  const d = r.json && (r.json.data ?? r.json.list ?? r.json.records);
  return Array.isArray(d) ? d : Array.isArray(d?.list) ? d.list : [];
}

// ---------- commands ----------
async function scan() {
  log(`== U5 probe scan @ ${BASE}  types=[${TYPES}]  output=${RUN_DIR}`);
  const ver = await post('/getDeviceVersion', { password: PASSWORD }, 10000);
  log('\n-- getDeviceVersion', ver.error || ver.json || ver.text);
  if (ver.status === 0) { log('Device unreachable — check IP / same LAN.'); return; }

  const emp = await post('/getEmployeeList', { password: PASSWORD });
  const empRows = rowsOf(emp);
  log(`\n-- getEmployeeList: ${empRows.length} enrolled (${emp.bytes} bytes, ${emp.ms} ms)`);
  saveJson('employees.json', empRows.map(r => stripRow(r, 'emp', false)));

  const summary = {};
  for (const type of TYPES) {
    const r = await fetchType(type);
    const rows = rowsOf(r);
    const unknown = rows.filter(x => looksUnknown(x).length);
    summary[type] = {
      httpStatus: r.status, ms: r.ms, bytes: r.bytes, error: r.error,
      topLevel: r.json ? Object.fromEntries(Object.entries(r.json).filter(([k]) => k !== 'data')) : r.text,
      rowCount: rows.length, unknownLookingRows: unknown.length,
      fields: inventory(rows.map(x => stripRow(x, '', false))),
    };
    // keep the 10 newest rows of each type (+ their photos) for eyeballing
    const newest = [...rows].sort((a, b) => String(b.checkin_time).localeCompare(String(a.checkin_time))).slice(0, 10);
    saveJson(`type-${type}-newest.json`, newest.map(x => ({ unknownReasons: looksUnknown(x), ...stripRow(x, `type${type}`, true) })));
    log(`\n-- getWorkNoteList type=${type}: HTTP ${r.status}, ${rows.length} rows, ${unknown.length} look unknown, ${r.bytes} bytes, ${r.ms} ms ${r.error || ''}`);
    if (rows.length) log('   fields:', Object.keys(summary[type].fields).join(', '));
  }
  saveJson('summary.json', summary);
  log('\nDone. Compare type-*-newest.json files: the type whose rows contain the stranger you just created is the one we need.');
}

async function watch() {
  log(`== U5 watch @ ${BASE}  types=[${TYPES}]  every ${INTERVAL / 1000}s — Ctrl+C to stop`);
  const seen = {};
  for (const type of TYPES) {
    const rows = rowsOf(await fetchType(type));
    seen[type] = new Set(rows.map(rowKey));
    log(`baseline type=${type}: ${rows.length} rows`);
  }
  log('\nBaseline taken. Now walk up to the machine (enrolled person, then a NOT-enrolled person).\n');
  for (;;) {
    await new Promise(r => setTimeout(r, INTERVAL));
    for (const type of TYPES) {
      const res = await fetchType(type);
      if (res.status === 0) { log(`type=${type}: ${res.error}`); continue; }
      for (const row of rowsOf(res)) {
        const k = rowKey(row);
        if (seen[type].has(k)) continue;
        seen[type].add(k);
        const reasons = looksUnknown(row);
        const stripped = stripRow(row, `watch-type${type}`, true);
        log(`\n[${new Date().toLocaleTimeString()}] NEW row in type=${type}  ${reasons.length ? 'UNKNOWN? (' + reasons.join(', ') + ')' : 'known person'}`);
        log(stripped);
        fs.appendFileSync(path.join(RUN_DIR, 'new-rows.jsonl'), JSON.stringify({ type, reasons, row: stripped }) + '\n');
      }
    }
  }
}

async function endpoints() {
  const guesses = [
    '/getStrangerList', '/getStrangerNoteList', '/getStrangerRecord', '/getStrangerLog',
    '/getVisitorList', '/getVisitorNoteList', '/getVisitorRecord',
    '/getNoteList', '/getRecordList', '/getPassRecord', '/getSnapList',
  ];
  log(`== guessed read-only endpoints @ ${BASE}`);
  const out = {};
  for (const ep of guesses) {
    const r = await post(ep, { password: PASSWORD }, 10000);
    const rows = rowsOf(r);
    out[ep] = { status: r.status, bytes: r.bytes, error: r.error, topLevel: r.json ? Object.keys(r.json) : r.text, rows: rows.length };
    log(`${ep.padEnd(24)} HTTP ${r.status}  ${rows.length} rows  ${r.error || (r.json ? JSON.stringify(r.json).slice(0, 150) : r.text || '')}`);
    if (rows.length) saveJson(`endpoint${ep.replace(/\//g, '_')}.json`, rows.slice(0, 10).map(x => stripRow(x, 'ep' + ep.slice(1), true)));
  }
  saveJson('endpoints.json', out);
}

async function enrollTest() {
  const photo = opt('photo', null);
  if (!photo || photo === true || !fs.existsSync(photo)) { log('enroll-test needs --photo <path to a saved stranger .jpg from scan/watch>'); process.exit(1); }
  const idNumber = String(opt('id', 'VPROBE01'));
  const name = String(opt('name', 'TempProbe')).slice(0, 10);
  const b64 = fs.readFileSync(photo).toString('base64');
  log(`== enroll-test: ${photo} (${b64.length} b64 chars) as id_number=${idNumber} name=${name}`);
  const r = await post('/insertEmployee', {
    password: PASSWORD, name, id_number: idNumber, access_card_number: '',
    pass_date: String(opt('pass-date', '0')), pass_time: String(opt('pass-time', '0')),
    pic_large: 'data:image/jpeg;base64,' + b64,
  });
  const code = r.json?.code;
  log('insertEmployee ->', r.error || r.json || r.text);
  log(code === 200 ? 'ACCEPTED: stranger snapshot is good enough to enroll.'
    : code === 12 ? 'code 12: face too similar to someone already enrolled (duplicate check works).'
    : 'REJECTED / unexpected — snapshot may be too small or cropped.');

  const list = rowsOf(await post('/getEmployeeList', { password: PASSWORD }));
  const me = list.find(e => String(e.id_number) === idNumber);
  log('now on device:', me ? stripRow(me, 'enrolled', false) : 'not found');
  if (me && opt('cleanup', false)) {
    const d = await post('/deleteEmployee', { password: PASSWORD, userid: [me.userid] });
    log('cleanup deleteEmployee ->', d.error || d.json);
  } else if (me) log(`Left enrolled. Walk up to confirm it now recognises them; then re-run with --cleanup, or delete userid ${me.userid} in the web UI.`);
}

const commands = { scan, watch, endpoints, 'enroll-test': enrollTest };
if (!commands[cmd]) { console.log('Unknown command. Use: scan | watch | endpoints | enroll-test'); process.exit(1); }
commands[cmd]().catch(e => { log('FATAL', e.stack || e.message); process.exit(1); });
