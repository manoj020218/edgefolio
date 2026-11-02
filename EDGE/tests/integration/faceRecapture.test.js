// Face ID re-capture approval flow. Calls handlers directly against a temp DB.
// Run: node --test tests/integration/faceRecapture.test.js
// (if better-sqlite3 is built for Electron ABI:
//  ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron --test tests/integration/faceRecapture.test.js)
const os = require('os');
const path = require('path');
const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-recap-'));
process.env.EDGEFOLIO_DB_PATH = path.join(tmp, 'test.db');

const { getDb, closeDb } = require('../../backend/config/database');
const h = require('../../backend/controllers/apkController');

function call(handler, { user, body = {}, params = {} } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(b) { resolve({ status: this.statusCode, body: b }); return this; },
    };
    handler({ user, body, params }, res, (err) => (err ? resolve({ status: err.status || err.statusCode || 500, body: { error: err.message } }) : reject(new Error('next() without error'))));
  });
}

const emb = () => Array.from({ length: 192 }, () => Math.random());
let db, emp, admin;

test.before(() => {
  db = getDb();
  const ins = db.prepare("INSERT INTO employees (id, emp_code, name, email, department, status, app_role) VALUES (?,?,?,?,?, 'active', ?)");
  ins.run('e1', 'EMP1', 'Emp One', 'e1@x.in', 'Ops', 'employee');
  ins.run('a1', 'HR1', 'HR One', 'a1@x.in', 'HR', 'hr-admin');
  emp = { empId: 'e1', empCode: 'EMP1', role: 'employee' };
  admin = { empId: 'a1', empCode: 'HR1', role: 'hr-admin' };
});
test.after(() => { closeDb(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('first enroll is free, status reports canEnroll', async () => {
  let r = await call(h.getMyFaceEnrollStatusHandler, { user: emp });
  assert.equal(r.body.data.enrolled, false);
  assert.equal(r.body.data.canEnroll, true);
  assert.equal(r.body.data.recapture, null);
  r = await call(h.createRecaptureRequestHandler, { user: emp });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'NOT_ENROLLED');
  r = await call(h.selfEnrollFaceHandler, { user: emp, body: { embedding: emb() } });
  assert.equal(r.status, 200);
});

test('re-enroll blocked without approval', async () => {
  const r = await call(h.selfEnrollFaceHandler, { user: emp, body: { embedding: emb() } });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'RECAPTURE_NOT_APPROVED');
  const s = await call(h.getMyFaceEnrollStatusHandler, { user: emp });
  assert.equal(s.body.data.canEnroll, false);
});

test('request -> duplicate 409 -> approve -> one re-enroll -> used -> blocked', async () => {
  let r = await call(h.createRecaptureRequestHandler, { user: emp, body: { reason: '  new phone ' } });
  assert.equal(r.status, 200);
  const id = r.body.data.id;
  assert.equal(r.body.data.status, 'pending');
  r = await call(h.createRecaptureRequestHandler, { user: emp });
  assert.equal(r.status, 409);

  r = await call(h.listRecaptureRequestsHandler, { user: admin });
  assert.equal(r.body.data.length, 1);
  assert.equal(r.body.data[0].empCode, 'EMP1');
  assert.equal(r.body.data[0].reason, 'new phone');

  r = await call(h.approveRecaptureHandler, { user: admin, params: { id } });
  assert.equal(r.body.data.status, 'approved');
  assert.ok(r.body.data.expiresAt);
  r = await call(h.approveRecaptureHandler, { user: admin, params: { id } });
  assert.equal(r.status, 404);

  r = await call(h.createRecaptureRequestHandler, { user: emp });
  assert.equal(r.status, 409); // unexpired approval counts as open
  r = await call(h.getMyFaceEnrollStatusHandler, { user: emp });
  assert.equal(r.body.data.canEnroll, true);
  assert.equal(r.body.data.recapture.status, 'approved');

  r = await call(h.selfEnrollFaceHandler, { user: emp, body: { embedding: emb() } });
  assert.equal(r.status, 200);
  assert.equal(db.prepare('SELECT status FROM face_recapture_requests WHERE id = ?').get(id).status, 'used');

  r = await call(h.selfEnrollFaceHandler, { user: emp, body: { embedding: emb() } });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'RECAPTURE_NOT_APPROVED');
});

test('reject path', async () => {
  let r = await call(h.createRecaptureRequestHandler, { user: emp });
  const id = r.body.data.id;
  r = await call(h.rejectRecaptureHandler, { user: admin, params: { id } });
  assert.equal(r.body.data.status, 'rejected');
  r = await call(h.getMyFaceEnrollStatusHandler, { user: emp });
  assert.equal(r.body.data.recapture.status, 'rejected');
  assert.equal(r.body.data.canEnroll, false);
  r = await call(h.selfEnrollFaceHandler, { user: emp, body: { embedding: emb() } });
  assert.equal(r.status, 403);
});

test('expired approval is reported expired and blocks', async () => {
  let r = await call(h.createRecaptureRequestHandler, { user: emp });
  const id = r.body.data.id;
  await call(h.approveRecaptureHandler, { user: admin, params: { id } });
  db.prepare('UPDATE face_recapture_requests SET expires_at = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), id);
  r = await call(h.getMyFaceEnrollStatusHandler, { user: emp });
  assert.equal(r.body.data.recapture.status, 'expired');
  assert.equal(r.body.data.canEnroll, false);
  r = await call(h.selfEnrollFaceHandler, { user: emp, body: { embedding: emb() } });
  assert.equal(r.status, 403);
  // an expired approval no longer counts as open: a new request is allowed
  r = await call(h.createRecaptureRequestHandler, { user: emp });
  assert.equal(r.status, 200);
});
