'use strict';
// Tenant isolation (plan §7): one organisation must never see or change another's data — at the
// data layer (forOrg) and through the API with a real token. Phase 2 gate: this file must pass.
const test = require('node:test');
const assert = require('node:assert');
const { startServer, makeOrg, makeEmployee, api, embedding, punchBody } = require('./helpers');
const { forOrg } = require('../src/tenancy');
const { Employee, Punch } = require('../src/models');

let srv, A, B, client;

test.before(async () => {
  srv = await startServer();
  client = api(srv.url);
  A = await makeOrg('AAAAAA', 'Alpha Ltd');
  B = await makeOrg('BBBBBB', 'Beta Ltd');
  // Same empCode in both orgs on purpose — IDs are only unique per organisation.
  await makeEmployee(A, { empId: 'a1', empCode: 'EMP001', name: 'Asha (A)', password: 'pass-a' });
  await makeEmployee(B, { empId: 'b1', empCode: 'EMP001', name: 'Bala (B)', password: 'pass-b' });
  await makeEmployee(B, { empId: 'b-hr', empCode: 'HR1', role: 'hr-admin', password: 'pass-bhr' });
});
test.after(async () => { await srv.stop(); });

test('data layer: forOrg only sees its own rows', async () => {
  const a = await forOrg(A._id).Employee.find({}).lean();
  assert.deepStrictEqual(a.map((e) => e.empId), ['a1']);
  assert.strictEqual(await forOrg(A._id).Employee.countDocuments({ empId: 'b1' }), 0);
});

test('data layer: an orgId in the filter, document or update is overridden', async () => {
  const sneaky = await forOrg(A._id).Employee.find({ orgId: B._id }).lean();
  assert.ok(sneaky.every((e) => String(e.orgId) === String(A._id)));

  const created = await forOrg(A._id).Employee.create({ orgId: B._id, empId: 'a2', empCode: 'EMP002', name: 'X' });
  assert.strictEqual(String(created.orgId), String(A._id));

  await forOrg(A._id).Employee.updateOne({ empId: 'a2' }, { $set: { orgId: B._id, name: 'moved?' } });
  const after = await Employee.findOne({ empId: 'a2' }).lean();
  assert.strictEqual(String(after.orgId), String(A._id));
  assert.strictEqual(after.name, 'moved?');

  const aggB = await forOrg(A._id).Employee.aggregate([{ $match: { orgId: B._id } }]);
  assert.strictEqual(aggB.length, 0);
});

test('API: same Employee ID logs into the right company by company code', async () => {
  const ra = await client.post('/api/v1/apk/auth/login', { orgCode: 'AAAAAA', body: { empCode: 'EMP001', password: 'pass-a' } });
  assert.strictEqual(ra.body.data.user.name, 'Asha (A)');
  const rb = await client.post('/api/v1/apk/auth/login', { orgCode: 'BBBBBB', body: { empCode: 'EMP001', password: 'pass-b' } });
  assert.strictEqual(rb.body.data.user.name, 'Bala (B)');
  // A's password does not open B's account with the same Employee ID.
  const cross = await client.post('/api/v1/apk/auth/login', { orgCode: 'BBBBBB', body: { empCode: 'EMP001', password: 'pass-a' } });
  assert.strictEqual(cross.status, 401);
});

test('API: A\'s token cannot read or write B\'s data', async () => {
  const tA = await client.login('AAAAAA', 'EMP001', 'pass-a');
  const tBhr = await client.login('BBBBBB', 'HR1', 'pass-bhr');

  // B's employee enrolls a face; A's employee can't fetch it (looks like it doesn't exist).
  const tB = await client.login('BBBBBB', 'EMP001', 'pass-b');
  await client.post('/api/v1/apk/faces/self-enroll', { token: tB, body: { embedding: embedding(2) } });
  const steal = await client.get('/api/v1/apk/faces/b1/embedding', { token: tA });
  assert.ok([403, 404].includes(steal.status));

  // A punches; a body empId pointing at B's employee is refused.
  const forged = await client.post('/api/v1/apk/attendance', { token: tA, body: punchBody('b1', new Date().toISOString()) });
  assert.strictEqual(forged.status, 403);
  const ok = await client.post('/api/v1/apk/attendance', { token: tA, body: punchBody('a1', new Date().toISOString()) });
  assert.strictEqual(ok.body.ok, true);

  // The X-Org-Code header can't redirect an authenticated call to another company.
  const feedB = await client.get('/api/v1/apk/live-feed', { token: tBhr, orgCode: 'AAAAAA' });
  assert.strictEqual(feedB.body.data.feed.length, 0);           // B's feed: A's punch is not in it
  const empsB = await client.get('/api/v1/apk/employees', { token: tBhr });
  assert.deepStrictEqual(empsB.body.data.map((e) => e.id).sort(), ['b-hr', 'b1']);

  const punches = await Punch.find({}).lean();
  assert.ok(punches.every((p) => String(p.orgId) === String(A._id)));
});
