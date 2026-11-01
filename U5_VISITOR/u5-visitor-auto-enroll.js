#!/usr/bin/env node
/**
 * U5 visitor auto-enroll — DEMO script (no dependencies, Node 18+).
 *
 * Turns an unknown face at the U5 into a temporary visitor ID, with no enrollment form:
 *   stranger at machine (userid -1, "陌生人")  ->  photo enrolled as V0001 / "Temp V0001"
 *   next visit  ->  U5 recognises them (green box)  ->  EDGE's normal U5 poll stages a punch
 *   for machine ID "V0001"  ->  HR links V0001 to a "Temp Labour" employee in EdgeFolio.
 *
 * Runs on the EdgeFolio PC next to EDGE. EDGE polls the U5 every 30 s; this polls every 3 s.
 * The U5 is single-threaded, so a clashing request just fails and is retried next cycle.
 *
 * Commands:
 *   node u5-visitor-auto-enroll.js run      watch for strangers and enroll them (Ctrl+C to stop)
 *   node u5-visitor-auto-enroll.js list     visitors created so far + what the U5 has enrolled
 *   node u5-visitor-auto-enroll.js reset    DELETE every V#### person from the U5 and clear state
 *                                           (for rehearsing the demo; asks no questions)
 *
 * Options: --ip 192.168.1.92  --password 123456  --interval 3  --prefix V
 *          --cooldown 20   seconds after an enroll during which further strangers are ignored
 *          --settle 6      seconds to hold a stranger before acting (a match often follows it)
 *
 * Demo rules (deliberately simple — the production version needs a face-size check):
 *   - one ID per walk-up: a burst of stranger records within 8 s counts as one sighting,
 *     and the largest photo of the burst is used;
 *   - a stranger record within 10 s of a recognised punch is ignored (first frame at an angle);
 *   - the U5's own duplicate check (code 12) stops the same face getting a second ID.
 * Point the machine at the walk-up spot with nobody in the background: the U5 logs far-away
 * faces as strangers too.
 *
 * State: ./visitor-state/visitors.json + one photo per visitor (git-ignored: photos of people).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const cmd = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'run';
function opt(name, def) {
  const i = argv.indexOf('--' + name);
  return i === -1 || argv[i + 1] === undefined ? def : argv[i + 1];
}
const IP = opt('ip', process.env.U5_IP || '192.168.1.92');
const PASSWORD = String(opt('password', process.env.U5_PASSWORD || '123456'));
const INTERVAL_MS = Number(opt('interval', '3')) * 1000;
const PREFIX = String(opt('prefix', 'V'));
const COOLDOWN_S = Number(opt('cooldown', '20'));
const SETTLE_MS = Number(opt('settle', '6')) * 1000;
const BURST_S = 8;
const MATCH_WINDOW_S = 10;

const STATE_DIR = path.join(__dirname, 'visitor-state');
const STATE_FILE = path.join(STATE_DIR, 'visitors.json');
fs.mkdirSync(STATE_DIR, { recursive: true });

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { nextNo: 1, visitors: [] }; }
}
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }
function stamp() { return new Date().toLocaleTimeString(); }
function log(...a) { console.log(`[${stamp()}]`, ...a); }

async function post(endpoint, body, timeoutMs = 20000) {
  const res = await fetch(`http://${IP}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${endpoint}`);
  return res.json();
}
/** Newest page of the log. type 2 = recognised punches, type 1 = strangers. */
async function newestRows(type, count = 8) {
  const d = await post('/getWorkNoteList', { password: PASSWORD, type, index: 1, count });
  return Array.isArray(d.data) ? d.data : [];
}
/** All enrolled people (paged endpoint). */
async function allEmployees() {
  const out = [];
  for (let index = 1; index <= 500; index++) {
    const d = await post('/getEmployeeList', { password: PASSWORD, index, count: 8 });   // device steps index by 8 rows whatever count is
    const page = Array.isArray(d.data) ? d.data : [];
    out.push(...page);
    if (page.length < 8 || index >= Number(d.page_sum || 0)) break;
  }
  return out;
}
// Device timestamps are "YYYY-MM-DD HH:MM:SS" in the device's own clock; only ever compared
// with each other, so the device's timezone does not matter here.
function devSec(t) { return Date.parse(String(t).replace(' ', 'T') + 'Z') / 1000; }
function rowKey(r) { return `${r.checkin_time}|${(r.pic_large || '').length}`; }
function photoB64(r) { return String(r.pic_large || '').replace(/^data:image\/\w+;base64,/, ''); }

// ---------------------------------------------------------------- run
async function run() {
  const state = loadState();
  console.log(`== U5 visitor auto-enroll @ ${IP} — next ID ${PREFIX}${String(state.nextNo).padStart(4, '0')}`);
  console.log('   Point the machine at the walk-up spot, nobody in the background. Ctrl+C to stop.\n');

  const seen = new Set();
  let baselineDone = false;
  let pending = [];          // stranger rows waiting SETTLE_MS before we act: { row, firstSeen }
  let lastEnrollDev = 0;     // device-clock second of the last enroll trigger

  for (;;) {
    try {
      const strangers = await newestRows(1);
      const matches = await newestRows(2);

      if (!baselineDone) {   // ignore everything already in the log when we start
        strangers.forEach(r => seen.add(rowKey(r)));
        baselineDone = true;
        log(`ready (ignoring ${strangers.length} older stranger records)`);
      } else {
        for (const r of strangers) {
          if (seen.has(rowKey(r))) continue;
          seen.add(rowKey(r));
          pending.push({ row: r, firstSeen: Date.now() });
          log(`stranger seen at machine (${r.checkin_time})`);
        }
      }

      // Act on the oldest settled stranger; its burst-mates are consumed with it.
      pending.sort((a, b) => devSec(a.row.checkin_time) - devSec(b.row.checkin_time));
      if (pending.length && Date.now() - pending[0].firstSeen >= SETTLE_MS) {
        const t0 = devSec(pending[0].row.checkin_time);
        const burst = pending.filter(p => devSec(p.row.checkin_time) - t0 <= BURST_S);
        pending = pending.filter(p => !burst.includes(p));
        const nearMatch = matches.find(m => Math.abs(devSec(m.checkin_time) - t0) <= MATCH_WINDOW_S);

        if (t0 - lastEnrollDev < COOLDOWN_S) {
          log(`  ignored ${burst.length} record(s): within ${COOLDOWN_S}s of the last enroll`);
        } else if (nearMatch) {
          log(`  ignored ${burst.length} record(s): ${nearMatch.name} was recognised at ${nearMatch.checkin_time}`);
        } else {
          lastEnrollDev = t0;
          const best = burst.map(p => p.row).sort((a, b) => photoB64(b).length - photoB64(a).length)[0];
          await enroll(state, best);
        }
      }
    } catch (err) {
      log(`device busy/unreachable (${err.message}) — retrying`);
    }
    await new Promise(r => setTimeout(r, INTERVAL_MS));
  }
}

async function enroll(state, row) {
  const id = PREFIX + String(state.nextNo).padStart(4, '0');
  const name = `Temp ${id}`.slice(0, 10);       // U5 name limit is 10 chars
  const b64 = photoB64(row);
  if (b64.length < 2000) { log('  stranger record has no usable photo — skipped'); return; }

  const res = await post('/insertEmployee', {
    password: PASSWORD, name, id_number: id, access_card_number: '',
    pass_date: '0', pass_time: '0', pic_large: 'data:image/jpeg;base64,' + b64,
  }, 30000);

  if (res.code === 200) {
    const photo = `${id}.jpg`;
    fs.writeFileSync(path.join(STATE_DIR, photo), Buffer.from(b64, 'base64'));
    state.visitors.push({ id, name, firstSeen: row.checkin_time, enrolledAtPc: new Date().toISOString(), photo });
    state.nextNo++;
    saveState(state);
    log(`  ENROLLED ${id} ("${name}") — next visit will be recognised and marked present`);
  } else if (res.code === 12) {
    log('  U5 says this face is already enrolled (code 12) — no new ID');
  } else {
    log(`  U5 rejected the photo (code ${res.code}) — face probably too small/unclear, will try on next sighting`);
  }
}

// ---------------------------------------------------------------- list / reset
async function list() {
  const state = loadState();
  console.log(`Visitors created by this script (${state.visitors.length}):`);
  state.visitors.forEach(v => console.log(`  ${v.id}  ${v.name}  first seen ${v.firstSeen}  photo ${path.join(STATE_DIR, v.photo)}`));
  const emps = await allEmployees();
  console.log(`\nEnrolled on the U5 (${emps.length}):`);
  emps.forEach(e => console.log(`  userid ${e.userid}  id_number ${e.id_number}  ${e.name}`));
}

async function reset() {
  const re = new RegExp(`^${PREFIX}\\d{4}$`);
  const victims = (await allEmployees()).filter(e => re.test(String(e.id_number)));
  for (const e of victims) {
    const d = await post('/deleteEmployee', { password: PASSWORD, userid: [e.userid] });
    console.log(`deleted ${e.id_number} (${e.name}) -> ${JSON.stringify(d)}`);
  }
  for (const f of fs.readdirSync(STATE_DIR)) fs.unlinkSync(path.join(STATE_DIR, f));
  console.log(`Reset done: ${victims.length} visitor(s) removed from the U5, local state cleared. Other people untouched.`);
}

const commands = { run, list, reset };
if (!commands[cmd]) { console.log('Use: run | list | reset'); process.exit(1); }
commands[cmd]().catch(e => { console.error('FATAL', e.message); process.exit(1); });
