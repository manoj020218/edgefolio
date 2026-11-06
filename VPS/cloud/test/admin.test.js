'use strict';
// Work assignments + analytics (EDGE apkController shapes; CLOUD: owner may edit assignments).
const test = require('node:test');
const assert = require('node:assert');
const { startServer, makeOrg, makeEmployee, api } = require('./helpers');
const { forOrg } = require('../src/tenancy');
const { todayLocal } = require('../src/lib/time');

let srv, client, org, owner, hr, emp;

test.before(async () => {
  srv = await startServer();
  client = api(srv.url);
  org = await makeOrg('ADMN23', 'Admin Co');
  await makeEmployee(org, { empId: 'o1', empCode: 'OWN1', name: 'Olga', role: 'owner' });
  await makeEmployee(org, { empId: 'h1', empCode: 'HR1', name: 'Hari', role: 'hr-admin', department: 'Office' });
  await makeEmployee(org, { empId: 'e1', empCode: 'E1', name: 'Asha', department: 'Sales' });
  await makeEmployee(org, { empId: 'e2', empCode: 'E2', name: 'Bala', department: 'Sales' });
  owner = await client.login('ADMN23', 'OWN1');
  hr = await client.login('ADMN23', 'HR1');
  emp = await client.login('ADMN23', 'E1');
});
test.after(async () => { await srv.stop(); });

test('work assignments: create, list by date, today-status, delete', async () => {
  const today = todayLocal(330);
  const bad = await client.post('/api/v1/apk/work-assignments', { token: owner, body: { employeeId: 'e1', workType: 'office', fromDate: today, toDate: today } });
  assert.strictEqual(bad.status, 400);
  const rev = await client.post('/api/v1/apk/work-assignments', { token: owner, body: { employeeId: 'e1', workType: 'tour', fromDate: '2026-12-05', toDate: '2026-12-01' } });
  assert.strictEqual(rev.status, 400);
  const none = await client.post('/api/v1/apk/work-assignments', { token: owner, body: { employeeId: 'zz', workType: 'tour', fromDate: today, toDate: today } });
  assert.strictEqual(none.status, 404);
  const denied = await client.post('/api/v1/apk/work-assignments', { token: emp, body: { employeeId: 'e1', workType: 'tour', fromDate: today, toDate: today } });
  assert.strictEqual(denied.status, 403);

  const made = await client.post('/api/v1/apk/work-assignments', { token: owner, body: { employeeId: 'e1', workType: 'tour', fromDate: today, toDate: '2099-01-01', notes: 'Client visit' } });
  assert.strictEqual(made.status, 200);
  const id = made.body.data.id;

  const list = await client.get('/api/v1/apk/work-assignments', { token: hr, query: { date: today } });
  assert.deepStrictEqual(list.body.data, [{
    id, employee: { id: 'e1', name: 'Asha', empCode: 'E1', dept: 'Sales' },
    workType: 'tour', fromDate: today, toDate: '2099-01-01', notes: 'Client visit', createdBy: 'OWN1',
  }]);
  assert.deepStrictEqual((await client.get('/api/v1/apk/work-assignments', { token: hr, query: { date: '2000-01-01' } })).body.data, []);

  const st = await client.get('/api/v1/apk/today-status', { token: emp });
  assert.strictEqual(st.body.data.workType, 'tour');

  assert.strictEqual((await client.del(`/api/v1/apk/work-assignments/${id}`, { token: hr })).status, 200);
  assert.strictEqual((await client.del(`/api/v1/apk/work-assignments/${id}`, { token: hr })).status, 404);
  assert.strictEqual((await client.del('/api/v1/apk/work-assignments/not-an-id', { token: hr })).status, 404);
  assert.strictEqual((await client.get('/api/v1/apk/today-status', { token: emp })).body.data.workType, 'office');
});

test('analytics: 7-day trend and today by department', async () => {
  const today = todayLocal(330);
  await forOrg(org._id).AttendanceDay.create({ empId: 'e1', date: today, checkIn: '09:00:00', status: 'present' });
  const r = await client.get('/api/v1/apk/analytics', { token: owner });
  assert.strictEqual(r.status, 200);
  const { sevenDayTrend, departmentBreakdown } = r.body.data;
  assert.strictEqual(sevenDayTrend.length, 7);
  assert.deepStrictEqual(sevenDayTrend[6], { date: today, present: 1, total: 4 });
  assert.deepStrictEqual(departmentBreakdown, [
    { dept: 'Office', total: 1, present: 0 },
    { dept: 'Sales', total: 2, present: 1 },
    { dept: 'Unknown', total: 1, present: 0 },
  ]);
  assert.strictEqual((await client.get('/api/v1/apk/analytics', { token: emp })).status, 403);
});

test('alert subscriptions: watch, push on check-in/out, unwatch', async () => {
  const push = require('../src/lib/push');
  const sent = [];
  push.setTransport(async (m) => { sent.push(m); });
  await forOrg(org._id).Employee.updateOne({ empId: 'o1' }, { $set: { fcmToken: 'tok-owner' } });

  assert.strictEqual((await client.post('/api/v1/apk/alert-subscriptions', { token: owner, body: {} })).status, 400);
  assert.strictEqual((await client.post('/api/v1/apk/alert-subscriptions', { token: owner, body: { watchedEmpId: 'zz' } })).status, 404);
  assert.strictEqual((await client.get('/api/v1/apk/alert-subscriptions', { token: emp })).status, 403);

  const made = await client.post('/api/v1/apk/alert-subscriptions', { token: owner, body: { watchedEmpId: 'e2' } });
  assert.strictEqual(made.status, 200);
  const again = await client.post('/api/v1/apk/alert-subscriptions', { token: owner, body: { watchedEmpId: 'e2' } });
  assert.strictEqual(again.body.data.id, made.body.data.id);            // same pair = same row
  const list = await client.get('/api/v1/apk/alert-subscriptions', { token: owner });
  assert.deepStrictEqual(list.body.data, [{
    id: made.body.data.id, watched: { id: 'e2', name: 'Bala', empCode: 'E2', dept: 'Sales' }, alertCheckin: true, alertCheckout: true,
  }]);
  assert.deepStrictEqual((await client.get('/api/v1/apk/alert-subscriptions', { token: hr })).body.data, []);   // per watcher

  const bala = await client.login('ADMN23', 'E2');
  const now = new Date().toISOString();
  const { punchBody } = require('./helpers');
  assert.strictEqual((await client.post('/api/v1/apk/attendance', { token: bala, body: punchBody('e2', now) })).status, 200);
  await new Promise((r) => setTimeout(r, 300));
  assert.strictEqual(sent.length, 1);
  assert.deepStrictEqual(sent[0].tokens, ['tok-owner']);
  assert.strictEqual(sent[0].title, 'Bala checked in');
  assert.strictEqual(sent[0].data.type, 'ATTENDANCE_ALERT');

  assert.strictEqual((await client.post('/api/v1/apk/attendance/checkout', { token: bala, body: { timestamp: new Date(Date.now() + 1000).toISOString() } })).status, 200);
  await new Promise((r) => setTimeout(r, 300));
  assert.strictEqual(sent.length, 2);
  assert.strictEqual(sent[1].title, 'Bala checked out');

  assert.strictEqual((await client.del(`/api/v1/apk/alert-subscriptions/${made.body.data.id}`, { token: hr })).status, 404);   // not hr's
  assert.strictEqual((await client.del(`/api/v1/apk/alert-subscriptions/${made.body.data.id}`, { token: owner })).status, 200);
  push.setTransport(null);
});

test('face re-capture needs an approved request (24 h, one use)', async () => {
  const { embedding } = require('./helpers');
  const enroll = (seed) => client.post('/api/v1/apk/faces/self-enroll', { token: emp, body: { embedding: embedding(seed) } });
  const status = async () => (await client.get('/api/v1/apk/faces/self-enroll', { token: emp })).body.data;

  // Not enrolled yet: can't request, first enrollment is free.
  assert.strictEqual((await client.post('/api/v1/apk/faces/recapture-request', { token: emp, body: {} })).body.error, 'NOT_ENROLLED');
  assert.strictEqual((await status()).canEnroll, true);
  assert.strictEqual((await enroll(1)).status, 200);

  // Enrolled: re-capture blocked.
  const blocked = await enroll(2);
  assert.strictEqual(blocked.status, 403);
  assert.strictEqual(blocked.body.error, 'RECAPTURE_NOT_APPROVED');
  assert.deepStrictEqual([(await status()).canEnroll, (await status()).recapture], [false, null]);

  // Request → duplicate refused → admin sees it.
  const req1 = await client.post('/api/v1/apk/faces/recapture-request', { token: emp, body: { reason: 'New glasses' } });
  assert.strictEqual(req1.body.data.status, 'pending');
  assert.strictEqual((await client.post('/api/v1/apk/faces/recapture-request', { token: emp, body: {} })).status, 409);
  assert.strictEqual((await client.get('/api/v1/apk/faces/recapture-requests', { token: emp })).status, 403);
  const pending = (await client.get('/api/v1/apk/faces/recapture-requests', { token: hr })).body.data;
  assert.deepStrictEqual(pending.map((p) => [p.id, p.empCode, p.reason]), [[req1.body.data.id, 'E1', 'New glasses']]);
  assert.strictEqual((await status()).recapture.status, 'pending');
  assert.strictEqual((await enroll(2)).status, 403);

  // Reject → still blocked; new request → approve → one re-capture allowed.
  assert.strictEqual((await client.post(`/api/v1/apk/faces/recapture-requests/${req1.body.data.id}/reject`, { token: owner })).body.data.status, 'rejected');
  assert.strictEqual((await client.post(`/api/v1/apk/faces/recapture-requests/${req1.body.data.id}/approve`, { token: owner })).status, 404);
  const req2 = await client.post('/api/v1/apk/faces/recapture-request', { token: emp, body: {} });
  const ok = await client.post(`/api/v1/apk/faces/recapture-requests/${req2.body.data.id}/approve`, { token: hr });
  assert.strictEqual(ok.body.data.status, 'approved');
  assert.strictEqual((await status()).canEnroll, true);
  assert.strictEqual((await enroll(3)).status, 200);
  assert.strictEqual((await status()).recapture.status, 'used');
  assert.strictEqual((await enroll(4)).status, 403);            // used up

  // Expired approval: reported as 'expired' and blocks.
  const req3 = await client.post('/api/v1/apk/faces/recapture-request', { token: emp, body: {} });
  await client.post(`/api/v1/apk/faces/recapture-requests/${req3.body.data.id}/approve`, { token: hr });
  await forOrg(org._id).FaceRecaptureRequest.updateOne({ status: 'approved' }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  const st = await status();
  assert.deepStrictEqual([st.recapture.status, st.canEnroll], ['expired', false]);
  assert.strictEqual((await enroll(5)).status, 403);
});

test('notifications inbox: stored per recipient, unread count, mark read, own rows only', async () => {
  const push = require('../src/lib/push');
  const sent = [];
  push.setTransport(async (m) => { sent.push(m); });
  const db = forOrg(org._id);
  await db.AppNotification.deleteMany({});
  await db.FaceProfile.updateOne({ empId: 'e2' }, { $set: { embedding: Array(192).fill(0.01) } }, { upsert: true });
  const bala = await client.login('ADMN23', 'E2');

  assert.strictEqual((await client.post('/api/v1/apk/faces/recapture-request', { token: bala, body: { reason: 'beard' } })).status, 200);
  await new Promise((r) => setTimeout(r, 300));
  // Stored for each HR/owner, pushed on the requests channel.
  const forOwner = await client.get('/api/v1/apk/notifications', { token: owner });
  assert.strictEqual(forOwner.body.data.length, 1);
  assert.strictEqual(forOwner.body.data[0].type, 'FACE_RECAPTURE_REQUEST');
  assert.strictEqual(forOwner.body.data[0].read, false);
  assert.strictEqual(forOwner.body.meta.unread, 1);
  assert.strictEqual((await client.get('/api/v1/apk/notifications', { token: hr })).body.data.length, 1);
  assert.strictEqual((await client.get('/api/v1/apk/notifications', { token: emp })).body.data.length, 0);
  assert.strictEqual(sent.at(-1).channel, 'ef_requests_v2');

  // Someone else can't mark my row; I can.
  const id = forOwner.body.data[0].id;
  assert.strictEqual((await client.post('/api/v1/apk/notifications/read', { token: hr, body: { ids: [id] } })).body.data.updated, 0);
  assert.strictEqual((await client.post('/api/v1/apk/notifications/read', { token: owner, body: {} })).status, 400);
  assert.strictEqual((await client.post('/api/v1/apk/notifications/read', { token: owner, body: { ids: [id] } })).body.data.updated, 1);
  assert.deepStrictEqual((await client.get('/api/v1/apk/notifications/unread-count', { token: owner })).body.data, { unread: 0 });
  assert.strictEqual((await client.get('/api/v1/apk/notifications/unread-count', { token: hr })).body.data.unread, 1);
  assert.strictEqual((await client.post('/api/v1/apk/notifications/read', { token: hr, body: { all: true } })).body.data.updated, 1);
  push.setTransport(null);
});

test('broadcast: announcement stored, everyone notified, Home can read it', async () => {
  const push = require('../src/lib/push');
  const sent = [];
  push.setTransport(async (m) => { sent.push(m); });
  const db = forOrg(org._id);
  await db.AppNotification.deleteMany({});

  assert.strictEqual((await client.post('/api/v1/apk/broadcast', { token: emp, body: { type: 'general', message: 'x' } })).status, 403);
  assert.strictEqual((await client.post('/api/v1/apk/broadcast', { token: owner, body: { type: 'party', message: 'x' } })).status, 400);
  const b = await client.post('/api/v1/apk/broadcast', { token: owner, body: { type: 'holiday', message: 'Office closed Friday' } });
  assert.strictEqual(b.status, 200);
  assert.strictEqual(b.body.data.sentTo, 4);                       // every active employee
  await new Promise((r) => setTimeout(r, 300));
  assert.strictEqual(sent.at(-1).channel, 'ef_holiday_v2');
  assert.strictEqual(sent.at(-1).title, 'Holiday Notice');

  const inbox = await client.get('/api/v1/apk/notifications', { token: emp });
  assert.deepStrictEqual([inbox.body.data[0].type, inbox.body.data[0].body], ['ANNOUNCEMENT', 'Office closed Friday']);
  const ann = await client.get('/api/v1/announcements', { token: emp, query: { target: 'e1' } });
  assert.strictEqual(ann.body.data[0].message, 'Office closed Friday');
  assert.strictEqual(ann.body.data[0].announcedByName, 'Olga');
  assert.strictEqual((await client.get('/api/v1/announcements')).status, 401);

  // A notice targeted at one employee is not visible to others.
  await client.post('/api/v1/apk/broadcast', { token: hr, body: { type: 'general', message: 'Only Asha', target: 'e1' } });
  assert.strictEqual((await client.get('/api/v1/announcements', { token: emp })).body.data[0].message, 'Only Asha');
  const bala = await client.login('ADMN23', 'E2');
  assert.ok(!(await client.get('/api/v1/announcements', { token: bala, query: { target: 'e1' } })).body.data.some((a) => a.message === 'Only Asha'));

  await db.Holiday.create({ date: '2026-12-25', name: 'Christmas' });
  assert.deepStrictEqual((await client.get('/api/v1/holidays', { token: emp, query: { year: 2026 } })).body.data.map((h) => h.name), ['Christmas']);
  push.setTransport(null);
});

test('night shift 20:00 → 04:00: checkout after midnight closes the shift; CSV shows ISO times + overnight', async () => {
  const { punchBody } = require('./helpers');
  const db = forOrg(org._id);
  await db.Punch.deleteMany({ empId: 'e2' });
  await db.AttendanceDay.deleteMany({ empId: 'e2' });
  const bala = await client.login('ADMN23', 'E2');
  // 2026-11-10 20:00 IST = 14:30Z; 2026-11-11 04:00 IST = 22:30Z (previous day UTC)
  const IN = '2026-11-10T14:30:00.000Z', OUT = '2026-11-10T22:30:00.000Z';
  assert.strictEqual((await client.post('/api/v1/apk/attendance', { token: bala, body: punchBody('e2', IN) })).body.data.alreadyMarked, false);
  const again = await client.post('/api/v1/apk/attendance', { token: bala, body: punchBody('e2', '2026-11-10T20:30:00.000Z') });
  assert.strictEqual(again.body.data.alreadyMarked, true);                  // 02:00 IST, still on the same shift
  const out = await client.post('/api/v1/apk/attendance/checkout', { token: bala, body: { timestamp: OUT } });
  assert.strictEqual(out.status, 200);
  assert.strictEqual(out.body.data.hoursWorked, 8);
  const day = await db.AttendanceDay.findOne({ empId: 'e2', date: '2026-11-10' }).lean();
  assert.deepStrictEqual([day.checkIn, day.checkOut, day.overnight], ['20:00:00', '04:00:00', true]);
  assert.strictEqual(await db.AttendanceDay.countDocuments({ empId: 'e2', date: '2026-11-11' }), 0);

  const link = await client.get('/api/v1/apk/reports/attendance/link', { token: owner, query: { month: '2026-11' } });
  const csv = await (await fetch(link.body.data.url.replace(/^https?:\/\/[^/]+\/cloud/, srv.url).replace(/^https?:\/\/[^/]+(?=\/api)/, srv.url))).text();
  const row = csv.split('\r\n').find((l) => l.startsWith('2026-11-10,E2,'));
  assert.strictEqual(row, '2026-11-10,E2,Bala,Sales,2026-11-10T20:00:00+05:30,2026-11-11T04:00:00+05:30,480,8.00,present,office,yes,+05:30,General,480,0,480,8.00,present,720,0');
  // A stale "in" older than 20 h does not block a new check-in.
  await db.Punch.create({ seq: await db.nextSeq('punch'), empId: 'e2', eventType: 'in', at: new Date('2026-11-12T03:30:00Z'), date: '2026-11-12', time: '09:00:00', workDate: '2026-11-12' });
  const next = await client.post('/api/v1/apk/attendance', { token: bala, body: punchBody('e2', '2026-11-13T03:30:00.000Z') });
  assert.strictEqual(next.body.data.alreadyMarked, false);
});
