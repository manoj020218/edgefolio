'use strict';
// App API flows, checked against EDGE's response shapes (EDGE/backend/controllers/apkController.js).
const test = require('node:test');
const assert = require('node:assert');
const { startServer, makeOrg, makeEmployee, api, embedding, punchBody } = require('./helpers');
const { createOrganisation } = require('../src/orgAdmin');
const { forOrg } = require('../src/tenancy');

let srv, client, org, token;
// Fixed instants: 03:30Z = 09:00 IST, 12:30Z = 18:00 IST on 2026-11-02.
const T_IN = '2026-11-02T03:30:00.000Z', T_OUT = '2026-11-02T12:30:00.000Z';

test.before(async () => {
  srv = await startServer();
  client = api(srv.url);
  org = await makeOrg('ZXCV23', 'Zed Works', { weeklyOffDays: [0] });
  await makeEmployee(org, { empId: 'e1', empCode: 'EMP001', name: 'Meena', department: 'Ops' });
  await makeEmployee(org, { empId: 'blocked', empCode: 'EMP009', mobileLoginEnabled: false });
  await makeEmployee(org, { empId: 'hr', empCode: 'HR1', role: 'hr-admin' });
  token = await client.login('ZXCV23', 'EMP001');
});
test.after(async () => { await srv.stop(); });

test('public endpoints need a valid company code', async () => {
  assert.strictEqual((await client.get('/api/v1/apk/config')).status, 400);
  assert.strictEqual((await client.get('/api/v1/apk/config', { orgCode: 'NOPE99' })).status, 404);
  const cfg = await client.get('/api/v1/apk/config', { orgCode: 'zxcv23' });   // case-insensitive
  assert.deepStrictEqual(cfg.body.data, { min_apk_version: '1.0.0', geofence_radius_m: 200, offline_buffer_days: 7, company_name: 'Zed Works' });
  const offices = await client.get('/api/v1/apk/offices', { orgCode: 'ZXCV23' });
  assert.deepStrictEqual(offices.body.data, [{ id: 'ZXCV23', label: 'Zed Works' }]);
});

test('login-check and login: EDGE reasons and shapes', async () => {
  const chk = (c) => client.get('/api/v1/apk/login-check', { orgCode: 'ZXCV23', query: { empCode: c } });
  assert.deepStrictEqual((await chk('emp001')).body.data, { allowed: true, role: 'employee' });
  assert.deepStrictEqual((await chk('NOBODY')).body.data, { allowed: false, reason: 'EMPLOYEE_NOT_FOUND' });
  assert.deepStrictEqual((await chk('EMP009')).body.data, { allowed: false, reason: 'LOGIN_BLOCKED' });

  const blocked = await client.post('/api/v1/apk/auth/login', { orgCode: 'ZXCV23', body: { empCode: 'EMP009', password: 'secret1' } });
  assert.strictEqual(blocked.status, 403);
  assert.strictEqual(blocked.body.error, 'LOGIN_BLOCKED');
  const bad = await client.post('/api/v1/apk/auth/login', { orgCode: 'ZXCV23', body: { empCode: 'EMP001', password: 'wrong' } });
  assert.strictEqual(bad.status, 401);

  const good = await client.post('/api/v1/apk/auth/login', { orgCode: 'ZXCV23', body: { empCode: 'EMP001', password: 'secret1' } });
  assert.deepStrictEqual(Object.keys(good.body.data.user).sort(),
    ['department', 'designation', 'empCode', 'empId', 'isFieldEmployee', 'name', 'passwordMustChange', 'role']);
  assert.strictEqual((await client.get('/api/v1/apk/today-status')).status, 401);
});

test('new organisation: owner logs in with temp password, must change it', async () => {
  const { org: o, tempPassword } = await createOrganisation({ name: 'Fresh Co', ownerName: 'Owner One' });
  assert.match(o.orgCode, /^[A-HJ-NP-Z2-9]{6}$/);
  const r = await client.post('/api/v1/apk/auth/login', { orgCode: o.orgCode, body: { empCode: 'OWNER', password: tempPassword } });
  assert.strictEqual(r.body.data.user.passwordMustChange, true);
  assert.strictEqual(r.body.data.user.role, 'owner');
  const t = r.body.data.token;
  const wrong = await client.post('/api/v1/auth/change-password', { token: t, body: { currentPassword: 'x', newPassword: 'newpass1' } });
  assert.strictEqual(wrong.status, 401);
  const ch = await client.post('/api/v1/auth/change-password', { token: t, body: { currentPassword: tempPassword, newPassword: 'newpass1' } });
  assert.strictEqual(ch.body.ok, true);
  const again = await client.post('/api/v1/apk/auth/login', { orgCode: o.orgCode, body: { empCode: 'OWNER', password: 'newpass1' } });
  assert.strictEqual(again.body.data.user.passwordMustChange, false);
  const old = await client.post('/api/v1/apk/auth/login', { orgCode: o.orgCode, body: { empCode: 'OWNER', password: tempPassword } });
  assert.strictEqual(old.status, 401);
});

test('attendance: validation codes match EDGE', async () => {
  const post = (b) => client.post('/api/v1/apk/attendance', { token, body: b });
  assert.strictEqual((await post({ empId: 'e1' })).status, 400);
  const acc = await post(punchBody('e1', T_IN, { location: { lat: 1, lon: 1, accuracy: 250 } }));
  assert.deepStrictEqual([acc.status, acc.body.error], [422, 'LOCATION_ACCURACY']);
  assert.strictEqual((await post(punchBody('e1', T_IN, { liveness: 'FAILED' }))).status, 422);
  const wt = await post(punchBody('e1', T_IN, { workType: 'beach' }));
  assert.deepStrictEqual([wt.status, wt.body.error], [403, 'MOBILE_BLOCKED']);
});

test('attendance: check-in, duplicate, checkout, re-check-in; day keeps first-in/last-out (IST)', async () => {
  const inR = await client.post('/api/v1/apk/attendance', { token, body: punchBody('e1', T_IN) });
  assert.strictEqual(inR.body.data.alreadyMarked, false);
  assert.ok(inR.body.data.eventId);
  const dup = await client.post('/api/v1/apk/attendance', { token, body: punchBody('e1', '2026-11-02T03:35:00.000Z') });
  assert.deepStrictEqual(dup.body.data, { alreadyMarked: true, checkedInAt: '09:00:00' });

  const out = await client.post('/api/v1/apk/attendance/checkout', { token, body: { timestamp: '2026-11-02T08:30:00.000Z' } });
  assert.deepStrictEqual(out.body.data, { alreadyCheckedOut: false, checkedOutAt: '14:00:00', hoursWorked: 5 });
  const noOpen = await client.post('/api/v1/apk/attendance/checkout', { token, body: { timestamp: '2026-11-02T09:00:00.000Z' } });
  assert.strictEqual(noOpen.status, 404);

  await client.post('/api/v1/apk/attendance', { token, body: punchBody('e1', '2026-11-02T09:30:00.000Z') });   // 15:00 back in
  const out2 = await client.post('/api/v1/apk/attendance/checkout', { token, body: { timestamp: T_OUT } });      // 18:00 out
  assert.strictEqual(out2.body.data.hoursWorked, 9);

  const day = await forOrg(org._id).AttendanceDay.findOne({ empId: 'e1', date: '2026-11-02' }).lean();
  assert.deepStrictEqual([day.checkIn, day.checkOut, day.hoursWorked, day.mode], ['09:00:00', '18:00:00', 9, 'mobile-office']);
  assert.strictEqual(await forOrg(org._id).Punch.countDocuments({ empId: 'e1', date: '2026-11-02' }), 4);
});

test('batch-sync: offline re-sends are skipped, other people\'s records refused', async () => {
  const recs = [
    { timestamp: '2026-10-30T03:40:00.000Z', workType: 'tour', location: { lat: 1, lon: 1, accuracy: 5 } },
    { timestamp: '2026-10-31T03:40:00.000Z', workType: 'wfh' },
    { empId: 'hr', timestamp: '2026-10-29T03:40:00.000Z', workType: 'tour' },
    { timestamp: 'garbage', workType: 'tour' },
  ];
  const r1 = await client.post('/api/v1/apk/attendance/batch-sync', { token, body: { records: recs } });
  assert.deepStrictEqual(r1.body.data, { synced: 2, skipped: 0, failed: 2 });
  const r2 = await client.post('/api/v1/apk/attendance/batch-sync', { token, body: { records: recs.slice(0, 2) } });
  assert.deepStrictEqual(r2.body.data, { synced: 0, skipped: 2, failed: 0 });
  const d = await forOrg(org._id).AttendanceDay.findOne({ empId: 'e1', date: '2026-10-30' }).lean();
  assert.deepStrictEqual([d.checkIn, d.mode], ['09:10:00', 'mobile-tour']);
});

test('faces: enroll status, enroll, own embedding only', async () => {
  assert.deepStrictEqual((await client.get('/api/v1/apk/faces/self-enroll', { token })).body.data, { enrolled: false, enrolledAt: null, recapture: null, canEnroll: true });
  assert.strictEqual((await client.post('/api/v1/apk/faces/self-enroll', { token, body: { embedding: [1, 2] } })).status, 400);
  const e = await client.post('/api/v1/apk/faces/self-enroll', { token, body: { embedding: embedding(3) } });
  assert.strictEqual(e.body.data.saved, true);
  assert.strictEqual((await client.get('/api/v1/apk/faces/self-enroll', { token })).body.data.enrolled, true);
  const mine = await client.get('/api/v1/apk/faces/e1/embedding', { token });
  assert.strictEqual(mine.body.data.embedding.length, 192);
  assert.strictEqual((await client.get('/api/v1/apk/faces/hr/embedding', { token })).status, 403);
  const tHr = await client.login('ZXCV23', 'HR1');
  assert.deepStrictEqual([(await client.get('/api/v1/apk/faces/hr/embedding', { token: tHr })).body.error], ['NOT_ENROLLED']);
});

test('roles: live feed and employee list are HR/owner only', async () => {
  assert.strictEqual((await client.get('/api/v1/apk/live-feed', { token })).status, 403);
  const tHr = await client.login('ZXCV23', 'HR1');
  const emps = await client.get('/api/v1/apk/employees', { token: tHr });
  const meena = emps.body.data.find((x) => x.id === 'e1');
  assert.deepStrictEqual([meena.empCode, meena.enrollmentStatus], ['EMP001', 'complete']);
  const feed = await client.get('/api/v1/apk/live-feed', { token: tHr });
  assert.deepStrictEqual(Object.keys(feed.body.data.summary).sort(), ['absent', 'onTour', 'present', 'totalEmployees', 'wfh']);
});

test('profile, history and calendar', async () => {
  const p = await client.patch('/api/v1/apk/profile', { token, body: { bloodGroup: 'B+', notAField: 'x' } });
  assert.strictEqual(p.body.data.bloodGroup, 'B+');
  assert.ok(!('notAField' in p.body.data));
  const hist = await client.get('/api/v1/apk/attendance-history', { token });
  assert.ok(hist.body.data.some((m) => m.month === '2026-10' && m.present === 2));
  const cal = await client.get('/api/v1/apk/attendance-calendar', { token, query: { month: '2026-10' } });
  const byDate = Object.fromEntries(cal.body.data.map((d) => [d.date, d.status]));
  assert.strictEqual(byDate['2026-10-30'], 'incomplete');   // only a check-in was synced: plan section 2 = incomplete (orange)
  assert.strictEqual(byDate['2026-10-25'], 'weekly_off');   // a Sunday, org's only weekly off
  assert.strictEqual(byDate['2026-10-27'], 'absent');
  assert.strictEqual(cal.body.data.length, 31);
});
