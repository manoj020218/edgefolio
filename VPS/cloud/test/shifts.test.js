'use strict';
// Shifts, holidays, day status, monthly calendar and the CSV net-hours columns
// (ATTENDANCE_RULES_PLAN.md sections 2, 3, 6). March 2025 is used so the dates are always in the past.
const test = require('node:test');
const assert = require('node:assert');
const { startServer, makeOrg, makeEmployee, api } = require('./helpers');
const { Organisation } = require('../src/models');
const { forOrg } = require('../src/tenancy');
const { todayLocal } = require('../src/lib/time');

const S = '/api/v1/apk';
let srv, client, org, db, owner, hr, e1tok, e2tok;
let shiftB, shiftPaid, shiftNight;

// Org-local (IST, +05:30) wall time -> UTC instant.
const at = (date, hhmm) => new Date(Date.parse(`${date}T${hhmm}:00Z`) - 330 * 60000);
const hms = (hhmm) => `${hhmm}:00`;
async function punch(empId, date, inHHMM, outHHMM, outDate = date, extra = {}) {
  await db.AttendanceDay.create({
    empId, date,
    checkIn: inHHMM ? hms(inHHMM) : null, checkInAt: inHHMM ? at(date, inHHMM) : null,
    checkOut: outHHMM ? hms(outHHMM) : null, checkOutAt: outHHMM ? at(outDate, outHHMM) : null,
    overnight: outDate !== date, status: 'present', ...extra,
  });
}
const calendar = (token, query) => client.get(`${S}/attendance-calendar`, { token, query });
const byDate = (r) => Object.fromEntries(r.body.data.map((d) => [d.date, d]));

test.before(async () => {
  srv = await startServer();
  client = api(srv.url);
  org = await makeOrg('SHFT23', 'Shift Co');
  db = forOrg(org._id);
  await makeEmployee(org, { empId: 'o1', empCode: 'OWN1', role: 'owner' });
  await makeEmployee(org, { empId: 'h1', empCode: 'HR1', role: 'hr-admin' });
  await makeEmployee(org, { empId: 'e1', empCode: 'E1' });
  await makeEmployee(org, { empId: 'e2', empCode: 'E2' });
  await makeEmployee(org, { empId: 'e3', empCode: 'E3' });
  await makeEmployee(org, { empId: 'e4', empCode: 'E4' });
  [owner, hr, e1tok, e2tok] = await Promise.all(['OWN1', 'HR1', 'E1', 'E2'].map((c) => client.login('SHFT23', c)));
});
test.after(async () => { await srv.stop(); });

test('default shift is created lazily with the contract values', async () => {
  const r = await client.get(`${S}/shifts`, { token: e1tok });   // any logged-in user
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.data.length, 1);
  const g = r.body.data[0];
  assert.deepStrictEqual({ ...g, id: 'x', employees: 0 }, {
    id: 'x', name: 'General', start: '08:00', end: '18:00', breakStart: '13:00', breakEnd: '13:30', breakPaid: false,
    weeklyOff: [0], graceMinutes: 10, isDefault: true, overnight: false, employees: 0,
  });
  assert.strictEqual(g.employees, 6);   // everyone is on the default shift
  assert.strictEqual((await client.get(`${S}/shifts`, { token: owner })).body.data.length, 1);   // not created twice
});

test('shift CRUD: validation, permissions, default switching, in-use and default guards', async () => {
  const body = { name: 'Shift B', start: '09:00', end: '17:00', breakStart: '12:00', breakEnd: '12:30', breakPaid: false, weeklyOff: [1], graceMinutes: 5 };
  assert.strictEqual((await client.post(`${S}/shifts`, { token: e1tok, body })).status, 403);
  for (const bad of [{ ...body, start: '9am' }, { ...body, end: '24:00' }, { ...body, weeklyOff: [7] }, { ...body, name: ' ' },
    { ...body, breakEnd: null }, { ...body, start: '09:00', end: '09:00' }, { ...body, graceMinutes: -1 }]) {
    assert.strictEqual((await client.post(`${S}/shifts`, { token: owner, body: bad })).status, 400, JSON.stringify(bad));
  }
  const made = await client.post(`${S}/shifts`, { token: hr, body });
  assert.strictEqual(made.status, 200);
  shiftB = made.body.data;
  assert.strictEqual(shiftB.isDefault, false);
  assert.strictEqual(shiftB.overnight, false);
  assert.deepStrictEqual(shiftB.weeklyOff, [1]);

  const paid = await client.post(`${S}/shifts`, { token: owner, body: { name: 'Paid lunch', start: '08:00', end: '18:00', breakStart: '13:00', breakEnd: '13:30', breakPaid: true } });
  shiftPaid = paid.body.data;
  assert.deepStrictEqual(shiftPaid.weeklyOff, [0]);   // defaults
  const night = await client.post(`${S}/shifts`, { token: owner, body: { name: 'Night', start: '22:00', end: '06:00', breakStart: '02:00', breakEnd: '02:30', breakPaid: false } });
  shiftNight = night.body.data;
  assert.strictEqual(shiftNight.overnight, true);

  // assign people (PATCH /employees/:id and employees list)
  assert.strictEqual((await client.patch(`${S}/employees/e2`, { token: owner, body: { shiftId: 'nope' } })).status, 400);
  assert.strictEqual((await client.patch(`${S}/employees/e2`, { token: e1tok, body: { shiftId: shiftB.id } })).status, 403);
  assert.strictEqual((await client.patch(`${S}/employees/e2`, { token: owner, body: { shiftId: shiftB.id } })).status, 200);
  await client.patch(`${S}/employees/e3`, { token: hr, body: { shiftId: shiftPaid.id } });
  await client.patch(`${S}/employees/e4`, { token: hr, body: { shiftId: shiftNight.id } });
  const list = await client.get(`${S}/employees`, { token: owner });
  assert.strictEqual(list.body.data.find((e) => e.id === 'e2').shiftId, shiftB.id);
  assert.strictEqual(list.body.data.find((e) => e.id === 'e1').shiftId, null);
  const shifts = (await client.get(`${S}/shifts`, { token: owner })).body.data;
  assert.strictEqual(shifts.find((s) => s.id === shiftB.id).employees, 1);
  assert.strictEqual(shifts.find((s) => s.isDefault).employees, 3);   // OWN1, HR1, E1

  const del = await client.del(`${S}/shifts/${shiftB.id}`, { token: owner });
  assert.strictEqual(del.status, 409);
  assert.strictEqual(del.body.error, 'SHIFT_IN_USE');
  const def = shifts.find((s) => s.isDefault);
  const delDef = await client.del(`${S}/shifts/${def.id}`, { token: owner });
  assert.strictEqual(delDef.status, 409);
  assert.strictEqual(delDef.body.error, 'SHIFT_DEFAULT');
  assert.strictEqual((await client.patch(`${S}/shifts/${def.id}`, { token: owner, body: { isDefault: false } })).body.error, 'SHIFT_DEFAULT');

  // an unused shift can be deleted; the default can move
  const tmp = (await client.post(`${S}/shifts`, { token: owner, body: { name: 'Tmp', start: '10:00', end: '19:00', isDefault: true } })).body.data;
  assert.strictEqual(tmp.isDefault, true);
  const after = (await client.get(`${S}/shifts`, { token: owner })).body.data;
  assert.strictEqual(after.filter((s) => s.isDefault).length, 1);
  assert.strictEqual((await client.patch(`${S}/shifts/${def.id}`, { token: owner, body: { isDefault: true } })).body.data.isDefault, true);
  assert.deepStrictEqual((await client.del(`${S}/shifts/${tmp.id}`, { token: owner })).body.data, { deleted: true });
  assert.strictEqual((await client.del(`${S}/shifts/${tmp.id}`, { token: owner })).status, 404);
  assert.strictEqual((await client.patch(`${S}/shifts/${shiftB.id}`, { token: owner, body: { name: 'Shift B2' } })).body.data.name, 'Shift B2');
  assert.strictEqual((await client.patch(`${S}/shifts/${shiftB.id}`, { token: owner, body: { name: 'Shift B' } })).status, 200);
});

test('holidays: create, duplicate, list by year, delete, permissions', async () => {
  assert.strictEqual((await client.post(`${S}/holidays`, { token: e1tok, body: { date: '2025-03-12', name: 'Holi' } })).status, 403);
  for (const bad of [{ date: '2025-02-30', name: 'x' }, { date: 'tomorrow', name: 'x' }, { date: '2025-03-12', name: '' }]) {
    assert.strictEqual((await client.post(`${S}/holidays`, { token: owner, body: bad })).status, 400);
  }
  const h = await client.post(`${S}/holidays`, { token: hr, body: { date: '2025-03-12', name: 'Holi' } });
  assert.strictEqual(h.status, 200);
  assert.deepStrictEqual({ ...h.body.data, id: 'x' }, { id: 'x', date: '2025-03-12', name: 'Holi' });
  const dup = await client.post(`${S}/holidays`, { token: owner, body: { date: '2025-03-12', name: 'Again' } });
  assert.strictEqual(dup.status, 409);
  assert.strictEqual(dup.body.error, 'HOLIDAY_EXISTS');
  const tmp = (await client.post(`${S}/holidays`, { token: owner, body: { date: '2025-03-20', name: 'Temp' } })).body.data;
  const l = await client.get(`${S}/holidays`, { token: e1tok, query: { year: '2025' } });
  assert.deepStrictEqual(l.body.data.map((x) => x.date), ['2025-03-12', '2025-03-20']);
  assert.strictEqual((await client.get('/api/v1/holidays', { token: e1tok, query: { year: '2025' } })).body.data.length, 2);
  assert.deepStrictEqual((await client.del(`${S}/holidays/${tmp.id}`, { token: owner })).body.data, { deleted: true });
  assert.strictEqual((await client.del(`${S}/holidays/${tmp.id}`, { token: owner })).status, 404);
  assert.strictEqual((await client.get(`${S}/holidays`, { token: e1tok, query: { year: '2025' } })).body.data.length, 1);
});

test('calendar: unpaid break deducted, off-day work, incomplete, holiday, leave, absent, summary', async () => {
  await punch('e1', '2025-03-03', '08:00', '18:00');           // Monday: gross 600, break 30, net 570
  await punch('e1', '2025-03-04', '14:00', '18:00');           // after the break window: net 240
  await punch('e1', '2025-03-06', '08:05', null);              // forgot to punch out
  await punch('e1', '2025-03-09', '09:00', '12:00');           // Sunday = weekly off, worked: present
  await db.AttendanceDay.create({ empId: 'e1', date: '2025-03-13', status: 'leave', leaveType: 'casual' });

  const r = await calendar(e1tok, { month: '2025-03' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.data.length, 31);
  const d = byDate(r);
  assert.deepStrictEqual(
    { ...d['2025-03-03'], checkIn: undefined, checkOut: undefined },
    { date: '2025-03-03', status: 'present', checkIn: undefined, checkOut: undefined, overnight: false, grossMinutes: 600, breakMinutes: 30, netMinutes: 570, netHours: 9.5, worked_on_off_day: false, holidayName: null, leaveType: null, hoursWorked: 9.5 });
  assert.strictEqual(d['2025-03-03'].checkIn, '08:00:00');
  assert.strictEqual(d['2025-03-04'].breakMinutes, 0);
  assert.strictEqual(d['2025-03-04'].netMinutes, 240);
  assert.strictEqual(d['2025-03-06'].status, 'incomplete');
  assert.strictEqual(d['2025-03-06'].netMinutes, 0);
  assert.strictEqual(d['2025-03-09'].status, 'present');
  assert.strictEqual(d['2025-03-09'].worked_on_off_day, true);
  assert.strictEqual(d['2025-03-09'].netMinutes, 180);          // 09:00-12:00 is before the break
  assert.strictEqual(d['2025-03-02'].status, 'weekly_off');     // Sunday, no punch
  assert.strictEqual(d['2025-03-12'].status, 'holiday');        // not absent
  assert.strictEqual(d['2025-03-12'].holidayName, 'Holi');
  assert.strictEqual(d['2025-03-13'].status, 'leave');
  assert.strictEqual(d['2025-03-13'].leaveType, 'casual');
  assert.strictEqual(d['2025-03-10'].status, 'absent');         // Monday: e1 has no off day on Monday
  assert.deepStrictEqual(r.body.meta.summary, { present: 3, incomplete: 1, absent: 21, leave: 1, holidays: 1, weeklyOffs: 4, netMinutes: 990, netHours: 16.5 });
  assert.strictEqual(r.body.meta.month, '2025-03');
  assert.deepStrictEqual(r.body.meta.shift, { id: r.body.meta.shift.id, name: 'General', start: '08:00', end: '18:00', breakStart: '13:00', breakEnd: '13:30', breakPaid: false, weeklyOff: [0] });
});

test('calendar: weekly off is per shift (Shift B Monday off), paid break not deducted', async () => {
  const r = byDate(await calendar(owner, { month: '2025-03', empId: 'e2' }));
  assert.strictEqual(r['2025-03-10'].status, 'weekly_off');     // Monday off for Shift B
  assert.strictEqual(r['2025-03-09'].status, 'absent');         // Sunday is a working day on Shift B
  await punch('e3', '2025-03-03', '08:00', '18:00');
  const p = byDate(await calendar(hr, { month: '2025-03', empId: 'e3' }))['2025-03-03'];
  assert.deepStrictEqual([p.grossMinutes, p.breakMinutes, p.netMinutes, p.netHours], [600, 0, 600, 10]);
});

test('calendar: overnight shift with a break after midnight', async () => {
  await punch('e4', '2025-03-05', '22:00', '06:00', '2025-03-06');
  const r = await calendar(hr, { month: '2025-03', empId: 'e4' });
  const d = byDate(r)['2025-03-05'];
  assert.strictEqual(d.status, 'present');
  assert.strictEqual(d.overnight, true);
  assert.deepStrictEqual([d.grossMinutes, d.breakMinutes, d.netMinutes, d.netHours], [480, 30, 450, 7.5]);
  assert.strictEqual(byDate(r)['2025-03-06'].status, 'absent');   // the shift belongs to its start date
  // leaving before the break (00:30 the next day) deducts nothing
  await punch('e4', '2025-03-07', '22:00', '00:30', '2025-03-08');
  assert.strictEqual(byDate(await calendar(hr, { month: '2025-03', empId: 'e4' }))['2025-03-07'].breakMinutes, 0);
});

test('calendar: empId only for HR/owner; future dates omitted; bad empId 404', async () => {
  assert.strictEqual((await calendar(e1tok, { month: '2025-03', empId: 'e2' })).status, 403);
  assert.strictEqual((await calendar(e1tok, { month: '2025-03', empId: 'e1' })).status, 200);   // own id is fine
  assert.strictEqual((await calendar(hr, { month: '2025-03', empId: 'e2' })).status, 200);
  assert.strictEqual((await calendar(owner, { month: '2025-03', empId: 'ghost' })).status, 404);
  const today = todayLocal(330);
  const cur = await calendar(e1tok, { month: today.slice(0, 7) });
  assert.ok(cur.body.data.every((x) => x.date <= today));
  assert.strictEqual(cur.body.data.length, Number(today.slice(8)));
  const far = await calendar(e1tok, { month: '2099-01' });
  assert.deepStrictEqual(far.body.data, []);
});

test('CSV: new columns appended with a concrete row', async () => {
  const link = await client.get(`${S}/reports/attendance/link`, { token: owner, query: { month: '2025-03' } });
  const res = await fetch(link.body.data.url.replace('https://example.test/cloud', srv.url));
  const lines = (await res.text()).trim().split('\r\n');
  assert.match(lines[0], /,utc_offset,shift_name,gross_minutes,break_minutes,net_minutes,net_hours_2dp,day_status$/);
  const row = lines.find((l) => l.startsWith('2025-03-03,E1,'));
  assert.ok(row.endsWith('+05:30,General,600,30,570,9.50,present'), row);
  assert.ok(row.includes(',600,10.00,'), row);   // worked_minutes / worked_hours_2dp unchanged (= gross)
  const inc = lines.find((l) => l.startsWith('2025-03-06,E1,'));
  assert.ok(inc.endsWith('+05:30,General,,,,,incomplete'), inc);
  const night = lines.find((l) => l.startsWith('2025-03-05,E4,'));
  assert.ok(night.endsWith(',Night,480,30,450,7.50,present'), night);
  const paid = lines.find((l) => l.startsWith('2025-03-03,E3,'));
  assert.ok(paid.endsWith(',Paid lunch,600,0,600,10.00,present'), paid);
});

test('PC-linked company: shift/holiday/shift-assignment writes are MANAGED_IN_EDGE', async () => {
  const pc = await makeOrg('PCLK23', 'Pc Co', { weeklyOffDays: [0, 6] });
  await Organisation.updateOne({ _id: pc._id }, { $set: { edgeMachineId: 'machine-1' } });
  await makeEmployee(pc, { empId: 'p1', empCode: 'POWN', role: 'owner' });
  await makeEmployee(pc, { empId: 'p2', empCode: 'P2' });
  const t = await client.login('PCLK23', 'POWN');
  const list = await client.get(`${S}/shifts`, { token: t });
  assert.strictEqual(list.status, 200);
  assert.deepStrictEqual(list.body.data[0].weeklyOff, [0, 6]);   // synced weekly off drives the default shift
  const body = { name: 'X', start: '08:00', end: '17:00' };
  for (const call of [
    () => client.post(`${S}/shifts`, { token: t, body }),
    () => client.patch(`${S}/shifts/${list.body.data[0].id}`, { token: t, body: { name: 'Y' } }),
    () => client.del(`${S}/shifts/${list.body.data[0].id}`, { token: t }),
    () => client.post(`${S}/holidays`, { token: t, body: { date: '2025-03-12', name: 'Holi' } }),
    () => client.del(`${S}/holidays/000000000000000000000000`, { token: t }),
    () => client.patch(`${S}/employees/p2`, { token: t, body: { shiftId: list.body.data[0].id } }),
  ]) {
    const r = await call();
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.body.error, 'MANAGED_IN_EDGE');
  }
  const cal = byDate(await calendar(t, { month: '2025-03' }));
  assert.strictEqual(cal['2025-03-01'].status, 'weekly_off');   // Saturday off from the synced setting
  assert.strictEqual((await client.get(`${S}/holidays`, { token: t })).status, 200);
});

test('app-only: POST /employees accepts shiftId', async () => {
  const bad = await client.post(`${S}/employees`, { token: owner, body: { name: 'New', shiftId: 'nope' } });
  assert.strictEqual(bad.status, 400);
  const ok = await client.post(`${S}/employees`, { token: owner, body: { name: 'New', shiftId: shiftB.id } });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual((await db.Employee.findOne({ empId: ok.body.data.empId }).lean()).shiftId, shiftB.id);
});
