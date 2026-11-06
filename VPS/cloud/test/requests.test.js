'use strict';
// Late / early marks, leave types + quota, requests and approvals (LEAVE_AND_LATE_PLAN.md).
// 2025 dates are used so every day is in the past. 2025-03-03 is a Monday; the default shift is
// 08:00-18:00, grace 10 min, Sunday off.
const test = require('node:test');
const assert = require('node:assert');
const { startServer, makeOrg, makeEmployee, api } = require('./helpers');
const { Organisation } = require('../src/models');
const { forOrg } = require('../src/tenancy');
const { computeDay, summarize } = require('../src/lib/dayStatus');

const S = '/api/v1/apk';
let srv, client, org, db, owner, hr, e1, e2, e3;
let nightShift;

const at = (date, hhmm) => new Date(Date.parse(`${date}T${hhmm}:00Z`) - 330 * 60000);
async function punch(empId, date, inHHMM, outHHMM, outDate = date) {
  await db.AttendanceDay.create({
    empId, date,
    checkIn: inHHMM ? `${inHHMM}:00` : null, checkInAt: inHHMM ? at(date, inHHMM) : null,
    checkOut: outHHMM ? `${outHHMM}:00` : null, checkOutAt: outHHMM ? at(outDate, outHHMM) : null,
    overnight: outDate !== date, status: 'present',
  });
}
const calendar = (token, query) => client.get(`${S}/attendance-calendar`, { token, query });
const byDate = (r) => Object.fromEntries(r.body.data.map((d) => [d.date, d]));
const leaveBody = (leaveType, fromDate, toDate, extra = {}) => ({ type: 'leave', title: 'x', details: { leaveType, fromDate, toDate, ...extra } });
const create = (token, body) => client.post(`${S}/requests`, { token, body });
const waitFor = async (fn) => { for (let i = 0; i < 40; i++) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 50)); } return null; };

test.before(async () => {
  srv = await startServer();
  client = api(srv.url);
  org = await makeOrg('LEAV25', 'Leave Co');
  db = forOrg(org._id);
  await makeEmployee(org, { empId: 'o1', empCode: 'OWN1', role: 'owner' });
  await makeEmployee(org, { empId: 'h1', empCode: 'HR1', role: 'hr-admin', department: 'People' });
  await makeEmployee(org, { empId: 'e1', empCode: 'E1', name: 'Asha' });
  await makeEmployee(org, { empId: 'e2', empCode: 'E2', name: 'Bala' });
  await makeEmployee(org, { empId: 'e3', empCode: 'E3', name: 'Chitra' });
  await makeEmployee(org, { empId: 'e4', empCode: 'E4', name: 'Night owl' });
  [owner, hr, e1, e2, e3] = await Promise.all(['OWN1', 'HR1', 'E1', 'E2', 'E3'].map((c) => client.login('LEAV25', c)));
  await client.get(`${S}/shifts`, { token: owner });   // creates the default General shift first
  nightShift = await db.Shift.create({ name: 'Night', start: '22:00', end: '06:00', weeklyOff: [0], graceMinutes: 10 });
  await db.Employee.updateOne({ empId: 'e4' }, { $set: { shiftId: String(nightShift._id) } });
  await db.Holiday.create({ date: '2025-03-12', name: 'Holi' });
});
test.after(async () => { await srv.stop(); });

test('late / early: grace edge, summary, off day, incomplete day (pure + calendar)', async () => {
  const shift = { start: '08:00', end: '18:00', weeklyOff: [0], graceMinutes: 10, breakStart: null, breakEnd: null };
  const mk = (date, i, o) => computeDay({ date, rec: { checkIn: `${i}:00`, checkInAt: at(date, i), checkOut: `${o}:00`, checkOutAt: at(date, o) }, shift });
  const onTime = mk('2025-03-03', '08:10', '17:50');            // exactly on the grace boundary
  assert.deepStrictEqual([onTime.late, onTime.lateMinutes, onTime.early, onTime.earlyMinutes], [false, 0, false, 0]);
  const bad = mk('2025-03-04', '08:11', '17:49');
  assert.deepStrictEqual([bad.late, bad.lateMinutes, bad.early, bad.earlyMinutes], [true, 11, true, 11]);
  const sum = summarize([onTime, bad]);
  assert.deepStrictEqual([sum.present, sum.lateDays, sum.lateMinutes, sum.earlyDays, sum.earlyMinutes], [2, 1, 11, 1, 11]);

  await punch('e1', '2025-03-03', '08:10', '18:00');
  await punch('e1', '2025-03-04', '08:30', '17:35');
  await punch('e1', '2025-03-05', '08:45', null);                // incomplete: late only
  await punch('e1', '2025-03-09', '11:00', '12:00');              // Sunday: no marks on a day off
  const r = await calendar(e1, { month: '2025-03' });
  const d = byDate(r);
  assert.deepStrictEqual([d['2025-03-03'].late, d['2025-03-03'].lateMinutes], [false, 0]);
  assert.deepStrictEqual([d['2025-03-04'].late, d['2025-03-04'].lateMinutes, d['2025-03-04'].early, d['2025-03-04'].earlyMinutes], [true, 30, true, 25]);
  assert.strictEqual(d['2025-03-05'].status, 'incomplete');
  assert.deepStrictEqual([d['2025-03-05'].lateMinutes, d['2025-03-05'].earlyMinutes], [45, 0]);
  assert.deepStrictEqual([d['2025-03-09'].late, d['2025-03-09'].early], [false, false]);
  const s = r.body.meta.summary;
  assert.deepStrictEqual([s.lateDays, s.lateMinutes, s.earlyDays, s.earlyMinutes], [2, 75, 1, 25]);
});

test('late / early: overnight shift ends on the next day', async () => {
  await punch('e4', '2025-03-03', '22:20', '05:30', '2025-03-04');
  const d = byDate(await calendar(hr, { month: '2025-03', empId: 'e4' }));
  assert.deepStrictEqual([d['2025-03-03'].lateMinutes, d['2025-03-03'].earlyMinutes], [20, 30]);
});

test('leave: working days only, half day, validation, overlap, quota', async () => {
  // Tue 11 - Thu 13 March with Holi on the 12th = 2 working days
  const ok = await create(e2, leaveBody('casual', '2025-03-11', '2025-03-13', { reason: 'family' }));
  assert.strictEqual(ok.status, 200);
  const q = ok.body.data;
  assert.strictEqual(q.type, 'leave');
  assert.strictEqual(q.status, 'pending');
  assert.strictEqual(q.days, 2);
  assert.strictEqual(q.title, 'Casual leave — 11 Mar to 13 Mar (2 days)');
  assert.deepStrictEqual(q.details, { leaveType: 'casual', fromDate: '2025-03-11', toDate: '2025-03-13', halfDay: false, days: 2, reason: 'family' });
  assert.strictEqual(q.hasBill, false);
  assert.strictEqual(q.decidedBy, null);

  const sunday = await create(e3, leaveBody('casual', '2025-03-09', '2025-03-09'));
  assert.strictEqual(sunday.status, 400);
  assert.match(sunday.body.error, /holidays or weekly offs/);
  assert.strictEqual((await create(e3, leaveBody('casual', '2025-03-12', '2025-03-12'))).status, 400);   // holiday

  const half = await create(e3, leaveBody('casual', '2025-03-17', '2025-03-17', { halfDay: true }));
  assert.strictEqual(half.body.data.days, 0.5);
  assert.match(half.body.data.title, /half day/);
  assert.strictEqual((await create(e3, leaveBody('sick', '2025-03-18', '2025-03-19', { halfDay: true }))).status, 400);

  for (const bad of [leaveBody('casual', '2025-03-20', '2025-03-19'), leaveBody('casual', '2025-03-2', '2025-03-3'), leaveBody('casual', '2025-01-01', '2025-04-01'),
    leaveBody('nope', '2025-03-20', '2025-03-21'), { type: 'leave', details: {} }, { type: 'bogus', title: 'x' }, { type: 'travel', title: '  ' }]) {
    assert.strictEqual((await create(e3, bad)).status, 400, JSON.stringify(bad));
  }

  const overlap = await create(e2, leaveBody('sick', '2025-03-13', '2025-03-14'));
  assert.strictEqual(overlap.status, 409);
  assert.strictEqual(overlap.body.error, 'LEAVE_OVERLAP');

  // sick = 6 a year: Mon 7 - Tue 15 April is 7 working days
  const quota = await create(e3, leaveBody('sick', '2025-04-07', '2025-04-15'));
  assert.strictEqual(quota.status, 409);
  assert.strictEqual(quota.body.error, 'LEAVE_QUOTA');
  assert.match(quota.body.message, /6 days/);
  assert.strictEqual((await create(e3, leaveBody('unpaid', '2025-04-07', '2025-04-15'))).status, 200);   // unpaid has no limit
});

test('requests: list, get, cancel, privacy, other request types and receipt photo', async () => {
  const mine = await client.get(`${S}/requests`, { token: e3, query: { status: 'pending' } });
  assert.strictEqual(mine.status, 200);
  assert.ok(mine.body.data.length >= 2);
  assert.ok(mine.body.data[0].createdAt >= mine.body.data[1].createdAt);   // newest first
  assert.strictEqual((await client.get(`${S}/requests`, { token: e3, query: { status: 'weird' } })).status, 400);

  const half = mine.body.data.find((x) => x.days === 0.5);
  assert.strictEqual((await client.get(`${S}/requests/${half.id}`, { token: e3 })).body.data.id, half.id);
  assert.strictEqual((await client.get(`${S}/requests/${half.id}`, { token: e1 })).status, 404);      // not yours
  assert.strictEqual((await client.post(`${S}/requests/${half.id}/cancel`, { token: e1 })).status, 404);
  const cancelled = await client.post(`${S}/requests/${half.id}/cancel`, { token: e3 });
  assert.strictEqual(cancelled.body.data.status, 'cancelled');
  assert.strictEqual((await client.post(`${S}/requests/${half.id}/cancel`, { token: e3 })).body.error, 'REQUEST_NOT_PENDING');
  assert.strictEqual((await client.get(`${S}/requests/not-an-id`, { token: e3 })).status, 404);
  // cancelled leave frees the days
  assert.strictEqual((await create(e3, leaveBody('casual', '2025-03-17', '2025-03-17'))).status, 200);

  const photo = Buffer.from('fake-jpeg-bytes').toString('base64');
  const exp = await create(e1, { type: 'expense', title: 'Taxi to client', details: { amount: 450 }, billBase64: photo });
  assert.strictEqual(exp.status, 200);
  assert.strictEqual(exp.body.data.hasBill, true);
  assert.deepStrictEqual(exp.body.data.details, { amount: 450 });
  assert.strictEqual(exp.body.data.days, null);
  assert.ok(!JSON.stringify((await client.get(`${S}/requests`, { token: e1 })).body.data).includes(photo));   // bill never in lists
  assert.strictEqual((await create(e1, { type: 'expense', title: 'x', billBase64: '!!notbase64' })).status, 400);
  assert.strictEqual((await create(e1, { type: 'expense', title: 'x', billBase64: 'A'.repeat(2200000) })).status, 400);   // > 1.5 MB decoded

  const bill = await client.get(`${S}/approvals/${exp.body.data.id}/bill`, { token: hr });
  assert.deepStrictEqual(bill.body.data, { mime: 'image/jpeg', data: photo });
  assert.strictEqual((await client.get(`${S}/approvals/${exp.body.data.id}/bill`, { token: e1 })).status, 403);
  const noBill = await create(e1, { type: 'travel', title: 'Pune trip' });
  assert.strictEqual((await client.get(`${S}/approvals/${noBill.body.data.id}/bill`, { token: hr })).status, 404);
});

test('approvals: permissions, approve / reject, own request, balance, notifications', async () => {
  const list = await client.get(`${S}/approvals`, { token: hr });
  assert.strictEqual(list.status, 200);
  assert.ok(list.body.meta.pendingCount >= 3);
  assert.ok(list.body.data.every((x) => x.status === 'pending'));
  const leave = list.body.data.find((x) => x.employee.empId === 'e2');
  assert.deepStrictEqual(leave.employee, { empId: 'e2', empCode: 'E2', name: 'Bala', department: null });
  assert.strictEqual(leave.balance, 12);   // nothing approved yet
  assert.strictEqual((await client.get(`${S}/approvals`, { token: e1 })).status, 403);
  assert.strictEqual((await client.get(`${S}/approvals`, { token: owner, query: { type: 'expense' } })).body.data.length, 1);
  assert.strictEqual((await client.get(`${S}/approvals`, { token: owner, query: { status: 'zzz' } })).status, 400);

  // a new request notified the owner and HR (not the requester)
  const note = await waitFor(() => db.AppNotification.findOne({ empId: 'h1', type: 'REQUEST_NEW' }).lean());
  assert.ok(note);
  assert.ok(!(await db.AppNotification.findOne({ empId: 'e2', type: 'REQUEST_NEW' }).lean()));

  assert.strictEqual((await client.post(`${S}/approvals/${leave.id}/approve`, { token: e1 })).status, 403);
  assert.strictEqual((await client.post(`${S}/approvals/${leave.id}/approve`, { token: e2 })).status, 403);   // not even your own
  const ok = await client.post(`${S}/approvals/${leave.id}/approve`, { token: hr, body: { note: 'enjoy' } });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.data.status, 'approved');
  assert.strictEqual(ok.body.data.decidedBy, 'h1');
  assert.strictEqual(ok.body.data.decidedByName, 'HR1');
  assert.strictEqual(ok.body.data.decisionNote, 'enjoy');
  assert.ok(ok.body.data.decidedAt);
  assert.strictEqual((await client.post(`${S}/approvals/${leave.id}/approve`, { token: hr })).body.error, 'REQUEST_NOT_PENDING');
  assert.strictEqual((await client.post(`${S}/requests/${leave.id}/cancel`, { token: e2 })).status, 409);

  const dec = await waitFor(() => db.AppNotification.findOne({ empId: 'e2', type: 'REQUEST_DECISION' }).lean());
  assert.strictEqual(dec.title, 'Leave approved');

  const bal = await client.get(`${S}/leave-balance`, { token: e2, query: { year: '2025' } });
  assert.deepStrictEqual(bal.body.data, { casual: 10, sick: 6, annual: 15 });
  assert.strictEqual(bal.body.meta.year, 2025);
  assert.deepStrictEqual(bal.body.meta.types.find((t) => t.key === 'casual'), { key: 'casual', name: 'Casual', perYear: 12, used: 2, pending: 0, remaining: 10 });
  assert.deepStrictEqual(bal.body.meta.types.find((t) => t.key === 'unpaid'), { key: 'unpaid', name: 'Unpaid', perYear: null, used: 0, pending: 0, remaining: null });
  assert.strictEqual((await client.get(`${S}/leave-balance`, { token: e3, query: { year: '2025' } })).body.meta.types[0].pending, 1);

  const exp = (await client.get(`${S}/approvals`, { token: owner, query: { type: 'expense' } })).body.data[0];
  const rej = await client.post(`${S}/approvals/${exp.id}/reject`, { token: owner, body: { note: 'no receipt' } });
  assert.strictEqual(rej.body.data.status, 'rejected');
  const rn = await waitFor(() => db.AppNotification.findOne({ empId: 'e1', type: 'REQUEST_DECISION' }).lean());
  assert.strictEqual(rn.title, 'Request rejected — no receipt');
  assert.strictEqual((await client.get(`${S}/requests`, { token: e1, query: { status: 'rejected' } })).body.data[0].decisionNote, 'no receipt');

  // HR cannot decide their own request; the owner can
  const hrReq = (await create(hr, { type: 'document_request', title: 'Experience letter' })).body.data;
  assert.strictEqual((await client.post(`${S}/approvals/${hrReq.id}/approve`, { token: hr })).status, 403);
  assert.strictEqual((await client.post(`${S}/approvals/${hrReq.id}/approve`, { token: owner })).status, 200);
  const ownReq = (await create(owner, { type: 'wfh', title: 'WFH Friday' })).body.data;
  assert.strictEqual((await client.post(`${S}/approvals/${ownReq.id}/approve`, { token: owner })).status, 200);
  assert.strictEqual((await client.post(`${S}/approvals/${'a'.repeat(24)}/approve`, { token: owner })).status, 404);
});

test('approved leave shows on the calendar, summary and CSV; a punch wins; approve re-checks quota', async () => {
  await punch('e2', '2025-03-13', '08:00', '18:00');   // worked on an approved leave day
  const r = await calendar(e2, { month: '2025-03' });
  const d = byDate(r);
  assert.strictEqual(d['2025-03-11'].status, 'leave');
  assert.strictEqual(d['2025-03-11'].leaveType, 'casual');
  assert.strictEqual(d['2025-03-12'].status, 'holiday');   // holiday inside the range stays a holiday
  assert.strictEqual(d['2025-03-13'].status, 'present');   // punch wins
  assert.strictEqual(r.body.meta.summary.leave, 1);
  // leave range over a weekly off: Fri 21 - Mon 24 March (Sunday 23rd stays weekly_off)
  const wk = await create(e2, leaveBody('annual', '2025-03-21', '2025-03-24'));
  assert.strictEqual(wk.body.data.days, 3);
  await client.post(`${S}/approvals/${wk.body.data.id}/approve`, { token: owner });
  const d2 = byDate(await calendar(e2, { month: '2025-03' }));
  assert.deepStrictEqual(['2025-03-21', '2025-03-22', '2025-03-23', '2025-03-24'].map((x) => d2[x].status), ['leave', 'leave', 'weekly_off', 'leave']);

  const link = await client.get(`${S}/reports/attendance/link`, { token: owner, query: { month: '2025-03' } });
  const lines = (await (await fetch(link.body.data.url.replace('https://example.test/cloud', srv.url))).text()).trim().split('\r\n');
  assert.match(lines[0], /,day_status,late_minutes,early_leave_minutes$/);
  const col = lines[0].split(',').length;
  const leaveRow = lines.find((l) => l.startsWith('2025-03-11,E2,'));
  assert.ok(leaveRow.includes(',General,,,,,leave,'), leaveRow);
  assert.strictEqual(leaveRow.split(',').length, col);
  assert.ok(lines.find((l) => l.startsWith('2025-03-21,E2,')).includes(',leave,'));
  assert.ok(!lines.some((l) => l.startsWith('2025-03-12,E2,')));   // holiday: no leave row
  const lateRow = lines.find((l) => l.startsWith('2025-03-04,E1,'));
  assert.ok(lateRow.endsWith(',present,30,25'), lateRow);

  // quota is re-checked on approval: two pending requests that together exceed the year's sick days
  await db.EmployeeRequest.deleteMany({ empId: 'e3' });
  const a = await create(e3, leaveBody('sick', '2025-05-05', '2025-05-09'));   // 5 days
  const b = await create(e3, leaveBody('sick', '2025-05-12', '2025-05-14'));   // 3 days (6 left while both pending)
  assert.strictEqual(a.status, 200);
  assert.strictEqual(b.status, 200);
  assert.strictEqual((await client.post(`${S}/approvals/${a.body.data.id}/approve`, { token: hr })).status, 200);
  const over = await client.post(`${S}/approvals/${b.body.data.id}/approve`, { token: hr });
  assert.strictEqual(over.status, 409);
  assert.strictEqual(over.body.error, 'LEAVE_QUOTA');
  assert.strictEqual((await client.post(`${S}/approvals/${b.body.data.id}/reject`, { token: hr })).status, 200);
});

test('leave types: defaults, edit rules, effect on balance', async () => {
  const def = await client.get(`${S}/leave-types`, { token: e1 });
  assert.deepStrictEqual(def.body.data, [
    { key: 'casual', name: 'Casual', perYear: 12 }, { key: 'sick', name: 'Sick', perYear: 6 },
    { key: 'annual', name: 'Earned', perYear: 15 }, { key: 'unpaid', name: 'Unpaid', perYear: null }]);
  assert.strictEqual((await client.put(`${S}/leave-types`, { token: e1, body: [{ key: 'casual', name: 'C', perYear: 1 }] })).status, 403);
  for (const bad of [[{ key: 'maternity', name: 'M', perYear: 1 }], [{ key: 'casual', name: '', perYear: 1 }], [{ key: 'casual', name: 'C', perYear: 61 }],
    [{ key: 'casual', name: 'C', perYear: -1 }], [{ key: 'casual', name: 'C', perYear: 'many' }], [{ key: 'unpaid', name: 'U', perYear: 5 }],
    [{ key: 'casual', perYear: 1 }, { key: 'casual', perYear: 2 }], []]) {
    assert.strictEqual((await client.put(`${S}/leave-types`, { token: owner, body: bad })).status, 400, JSON.stringify(bad));
  }
  const put = await client.put(`${S}/leave-types`, { token: hr, body: [{ key: 'casual', name: 'Casual leave', perYear: 3 }, { key: 'annual', name: 'Earned', perYear: null }] });
  assert.strictEqual(put.status, 200);
  assert.deepStrictEqual(put.body.data[0], { key: 'casual', name: 'Casual leave', perYear: 3 });
  assert.strictEqual(put.body.data[2].perYear, null);
  assert.strictEqual((await client.get(`${S}/leave-types`, { token: e2 })).body.data[0].perYear, 3);
  // e2 used 2 casual in 2025 -> 1 left; two more days now exceed the new quota
  const bal = await client.get(`${S}/leave-balance`, { token: e2, query: { year: '2025' } });
  assert.strictEqual(bal.body.data.casual, 1);
  assert.strictEqual(bal.body.data.annual, 999);   // no limit
  const quota = await create(e2, leaveBody('casual', '2025-06-02', '2025-06-03'));
  assert.strictEqual(quota.body.error, 'LEAVE_QUOTA');
  assert.match(quota.body.message, /1 day /);
  assert.strictEqual((await create(e2, leaveBody('casual', '2025-06-02', '2025-06-02'))).status, 200);
});

test('PC-linked company: requests and leave types are managed in EDGE', async () => {
  const pc = await makeOrg('LEAVPC', 'PC Co');
  await Organisation.updateOne({ _id: pc._id }, { $set: { edgeMachineId: 'machine-1' } });
  await makeEmployee(pc, { empId: 'o1', empCode: 'OWN1', role: 'owner' });
  await makeEmployee(pc, { empId: 'e1', empCode: 'E1' });
  const [po, pe] = await Promise.all([client.login('LEAVPC', 'OWN1'), client.login('LEAVPC', 'E1')]);
  const c = await create(pe, leaveBody('casual', '2025-03-11', '2025-03-11'));
  assert.strictEqual(c.status, 409);
  assert.strictEqual(c.body.error, 'MANAGED_IN_EDGE');
  assert.deepStrictEqual((await client.get(`${S}/requests`, { token: pe })).body.data, []);
  const bal = await client.get(`${S}/leave-balance`, { token: pe });
  assert.strictEqual(bal.status, 200);
  assert.deepStrictEqual(bal.body.data, { casual: 0, sick: 0, annual: 0 });
  assert.strictEqual((await client.put(`${S}/leave-types`, { token: po, body: [{ key: 'casual', name: 'C', perYear: 2 }] })).body.error, 'MANAGED_IN_EDGE');
  const id = 'b'.repeat(24);
  assert.strictEqual((await client.post(`${S}/approvals/${id}/approve`, { token: po })).body.error, 'MANAGED_IN_EDGE');
  assert.deepStrictEqual((await client.get(`${S}/approvals`, { token: po })).body.data, []);
});

test('requests are isolated per company', async () => {
  const other = await makeOrg('LEAVOT', 'Other Co');
  await makeEmployee(other, { empId: 'e2', empCode: 'E2' });
  const tok = await client.login('LEAVOT', 'E2');
  assert.deepStrictEqual((await client.get(`${S}/requests`, { token: tok })).body.data, []);
  const mine = (await client.get(`${S}/requests`, { token: e2 })).body.data[0];
  assert.strictEqual((await client.get(`${S}/requests/${mine.id}`, { token: tok })).status, 404);
});

test('future approved leave shows on the calendar; other future days stay hidden', () => {
  const { monthDays, FALLBACK_SHIFT } = require('../src/lib/dayStatus');
  const days = monthDays({ month: '2026-12', recs: [], shift: FALLBACK_SHIFT, holidays: [], tz: 330, today: '2026-12-01', leaveByDate: new Map([['2026-12-07', 'casual'], ['2026-12-06', 'casual']]) });
  assert.deepStrictEqual(days.filter((d) => d.date > '2026-12-01').map((d) => [d.date, d.status, d.leaveType]), [['2026-12-07', 'leave', 'casual']]);   // 6 Dec is a Sunday
});
