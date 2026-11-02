// Notifications inbox. Run: ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron --test tests/integration/appNotifications.test.js
const os = require('os');
const path = require('path');
const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-notif-'));
process.env.EDGEFOLIO_DB_PATH = path.join(tmp, 'test.db');

const { getDb, closeDb } = require('../../backend/config/database');
const h = require('../../backend/controllers/apkController');
const { notifyEmployees } = require('../../backend/services/appNotifyService');

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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let db;
const U = (id) => ({ empId: id, empCode: id.toUpperCase(), role: 'employee' });

test.before(() => {
  db = getDb();
  const ins = db.prepare("INSERT INTO employees (id, emp_code, name, email, department, status, app_role) VALUES (?,?,?,?,?, 'active', ?)");
  ins.run('e1', 'EMP1', 'Emp One', 'e1@x.in', 'Ops', 'employee');
  ins.run('e2', 'EMP2', 'Emp Two', 'e2@x.in', 'Ops', 'employee');
  ins.run('a1', 'HR1', 'HR One', 'a1@x.in', 'HR', 'hr-admin');
  ins.run('o1', 'OWN1', 'Owner', 'o1@x.in', 'HR', 'owner');
  db.prepare("INSERT INTO face_enrollments (emp_id, embedding_json) VALUES ('e1', '[1]')").run();
});
test.after(() => { closeDb(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('recapture request stores a row for each hr-admin/owner', async () => {
  const r = await call(h.createRecaptureRequestHandler, { user: U('e1') });
  assert.equal(r.status, 200);
  await wait(50);
  for (const id of ['a1', 'o1']) {
    const rows = db.prepare('SELECT * FROM app_notifications WHERE emp_id = ?').all(id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].type, 'FACE_RECAPTURE_REQUEST');
    assert.equal(JSON.parse(rows[0].data_json).requestId, r.body.data.id);
  }
  assert.equal(db.prepare("SELECT COUNT(*) n FROM app_notifications WHERE emp_id IN ('e1','e2')").get().n, 0);
});

test('list newest-first with unread; mark one / all; isolation', async () => {
  await notifyEmployees(db, ['e1', 'e1', 'e2'], { type: 'ANNOUNCEMENT', title: 'T1', body: 'b1', data: { x: 1 } });
  await wait(5);
  await notifyEmployees(db, ['e1'], { type: 'ATTENDANCE_ALERT', title: 'T2', body: 'b2' });

  let r = await call(h.listNotificationsHandler, { user: U('e1') });
  assert.equal(r.body.data.length, 2); // deduped
  assert.deepEqual(r.body.data.map((n) => n.title), ['T2', 'T1']);
  assert.equal(r.body.meta.unread, 2);
  assert.deepEqual(r.body.data[1].data, { x: 1 });
  assert.deepEqual(r.body.data[0].data, {});
  assert.equal(r.body.data[0].read, false);

  r = await call(h.unreadNotificationCountHandler, { user: U('e1') });
  assert.equal(r.body.data.unread, 2);

  const [n2, n1] = (await call(h.listNotificationsHandler, { user: U('e1') })).body.data;
  const e2Id = (await call(h.listNotificationsHandler, { user: U('e2') })).body.data[0].id;

  r = await call(h.markNotificationsReadHandler, { user: U('e2'), body: { ids: [n1.id] } });
  assert.equal(r.body.data.updated, 0);
  assert.equal((await call(h.unreadNotificationCountHandler, { user: U('e1') })).body.data.unread, 2);
  r = await call(h.markNotificationsReadHandler, { user: U('e1'), body: { ids: [e2Id] } });
  assert.equal(r.body.data.updated, 0);

  r = await call(h.markNotificationsReadHandler, { user: U('e1'), body: { ids: [n1.id] } });
  assert.equal(r.body.data.updated, 1);
  r = await call(h.listNotificationsHandler, { user: U('e1') });
  assert.equal(r.body.meta.unread, 1);
  assert.equal(r.body.data.find((n) => n.id === n1.id).read, true);

  r = await call(h.listNotificationsHandler, { user: U('e1'), query: { before: n2.createdAt } });
  assert.ok(r.body.data.every((n) => n.createdAt < n2.createdAt));

  r = await call(h.markNotificationsReadHandler, { user: U('e1'), body: { all: true } });
  assert.equal(r.body.data.updated, 1);
  assert.equal((await call(h.unreadNotificationCountHandler, { user: U('e1') })).body.data.unread, 0);
  assert.equal((await call(h.unreadNotificationCountHandler, { user: U('e2') })).body.data.unread, 1);

  r = await call(h.markNotificationsReadHandler, { user: U('e1'), body: {} });
  assert.equal(r.status, 400);
});

test('prunes rows older than 90 days on insert', async () => {
  db.prepare("INSERT INTO app_notifications (id, emp_id, type, title, created_at) VALUES ('old','e2','X','old',?)")
    .run(new Date(Date.now() - 100 * 86400000).toISOString());
  await notifyEmployees(db, ['e2'], { type: 'ANNOUNCEMENT', title: 'new' });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM app_notifications WHERE id = 'old'").get().n, 0);
});
