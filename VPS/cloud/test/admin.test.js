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
