// Night-shift attendance. Run: ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron --test tests/integration/nightShift.test.js
const os = require('os');
const path = require('path');
const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-night-'));
process.env.EDGEFOLIO_DB_PATH = path.join(tmp, 'test.db');

const { getDb, closeDb } = require('../../backend/config/database');
const h = require('../../backend/controllers/apkController');
const { stageRecords, commitMappedRecords } = require('../../backend/models/machineImportModel');
const { workedHours, workDateFor } = require('../../backend/services/shiftDay');

function call(handler, { user, body = {}, params = {}, query = {} } = {}) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(b) { resolve({ status: this.statusCode, body: b }); return this; },
    };
    handler({ user, body, params, query }, res, (err) => resolve({ status: err.statusCode || 500, body: { error: err.message } }));
  });
}
let db;
const rec = (id, date) => db.prepare('SELECT * FROM attendance_records WHERE member_id = ? AND date = ?').get(id, date);
const all = (id) => db.prepare('SELECT * FROM attendance_records WHERE member_id = ? ORDER BY date').all(id);
let batchN = 0;
function machine(empId, punches) {
  const batch = `B${++batchN}`;
  stageRecords(batch, 'alog', punches.map(([d, t]) => ({
    machineEmpId: empId, mappedEmployeeId: empId, punchDate: d, punchTime: t, recordType: 'punch',
  })));
  return commitMappedRecords(batch);
}

test.before(() => {
  db = getDb();
  const ins = db.prepare("INSERT INTO employees (id, emp_code, name, email, department, status, app_role) VALUES (?,?,?,?,?, 'active', 'user')");
  for (const id of ['n1', 'd1', 'f1', 'p1']) ins.run(id, id.toUpperCase(), id, `${id}@x.in`, 'Ops');
  db.prepare("INSERT INTO shifts (shift_id, shift_name, start_time, end_time, is_overnight) VALUES ('NS','Night','20:00','04:00',1)").run();
  db.prepare("UPDATE employees SET shift_id = 'NS' WHERE id = 'n1'").run();
  db.prepare("INSERT INTO work_assignments (id, employee_id, work_type, from_date, to_date) VALUES ('wa1','p1','wfh','2026-05-01','2026-05-31')").run();
});
test.after(() => { closeDb(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('workedHours', () => {
  assert.equal(workedHours('20:00', '04:00'), 8);
  assert.equal(workedHours('20:05:00', '04:02:00'), 7.95);
  assert.equal(workedHours('09:00', '18:00'), 9);
  assert.equal(workedHours('09:00', '09:00'), 0);
  assert.equal(workedHours(null, '09:00'), 0);
});

test('configured overnight shift: machine punches land on one record', () => {
  const r = machine('n1', [['2026-05-10', '20:05:00'], ['2026-05-11', '04:02:00']]);
  assert.equal(r.committed, 1);
  const rows = all('n1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2026-05-10');
  assert.equal(rows[0].check_in, '20:05:00');
  assert.equal(rows[0].check_out, '04:02:00');
  assert.equal(rows[0].hours_worked, 7.95);
  assert.equal(rows[0].overnight, 1);
});

test('day-shift employee unaffected', () => {
  machine('d1', [['2026-05-10', '09:00:00'], ['2026-05-10', '18:00:00'], ['2026-05-11', '09:05:00'], ['2026-05-11', '18:10:00']]);
  const rows = all('d1');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].check_in, '09:00:00');
  assert.equal(rows[0].check_out, '18:00:00');
  assert.equal(rows[0].hours_worked, 9);
  assert.equal(rows[0].overnight, 0);
});

test('fallback without a shift: 21:00 + 03:00 is one record, also across separate commits', () => {
  machine('f1', [['2026-05-10', '21:00:00'], ['2026-05-11', '03:00:00']]);
  let rows = all('f1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2026-05-10');
  assert.equal(rows[0].hours_worked, 6);
  assert.equal(rows[0].overnight, 1);

  machine('f1', [['2026-05-20', '22:00:00']]);
  machine('f1', [['2026-05-21', '05:30:00']]); // later commit closes the open evening record
  rows = all('f1');
  assert.equal(rows.length, 2);
  assert.equal(rows[1].date, '2026-05-20');
  assert.equal(rows[1].check_out, '05:30:00');
  assert.equal(rows[1].hours_worked, 7.5);
});

test('workDateFor basics', () => {
  assert.equal(workDateFor(db, 'n1', '2026-06-02', '03:00:00'), '2026-06-01');
  assert.equal(workDateFor(db, 'n1', '2026-06-02', '09:00:00'), '2026-06-02');
  assert.equal(workDateFor(db, 'd1', '2026-06-02', '03:00:00'), '2026-06-02');
});

test('phone checkout at 04:00 closes the previous evening check-in', async () => {
  const user = { empId: 'p1', empCode: 'P1' };
  // 21:00 IST on 2026-05-10 = 15:30Z
  const inR = await call(h.mobileAttendanceHandler, {
    body: { empId: 'p1', workType: 'wfh', timestamp: '2026-05-10T15:30:00.000Z', liveness: 'PASSED', location: { lat: 1, lon: 1, accuracy: 10 }, similarity: 90 },
  });
  assert.equal(inR.status, 200);
  // 04:00 IST on 2026-05-11 = 22:30Z on 05-10
  const out = await call(h.mobileCheckoutHandler, { user, body: { timestamp: '2026-05-10T22:30:00.000Z' } });
  assert.equal(out.status, 200, JSON.stringify(out.body));
  const rows = all('p1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2026-05-10');
  assert.equal(rows[0].check_out, '04:00:00');
  assert.equal(rows[0].hours_worked, 7);
  assert.equal(rows[0].overnight, 1);
  const ev = db.prepare('SELECT date, event_type FROM mobile_punch_events WHERE member_id = ? ORDER BY rowid').all('p1');
  assert.deepEqual(ev.map((e) => `${e.date}:${e.event_type}`), ['2026-05-10:in', '2026-05-11:out']);
});
