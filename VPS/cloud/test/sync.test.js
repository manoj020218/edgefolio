'use strict';
// EDGE ↔ cloud sync contract (routes/sync.js).
const test = require('node:test');
const assert = require('node:assert');
const { startServer, api, punchBody } = require('./helpers');
const { hashSecret } = require('../src/lib/password');

let srv, client, edge;   // edge = { orgCode, syncKey }
const sync = (method, path, key, body) => fetch(`${srv.url}/api/v1/sync${path}`, {
  method, headers: { 'content-type': 'application/json', ...(key ? { 'x-sync-key': key } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, body: await r.json() }));

const EDGE_PW = hashSecret('edge-pass');
const employees = (extra = []) => [
  { empId: 'EMP-001', empCode: 'E001', name: 'Ramesh', email: 'R@X.COM', department: 'Ops', appRole: 'user', mobileLoginEnabled: 1, passwordHash: EDGE_PW },
  { empId: 'EMP-002', empCode: 'E002', name: 'Priya', appRole: 'hr-admin', mobileLoginEnabled: 1, passwordHash: EDGE_PW },
  ...extra,
];

test.before(async () => { srv = await startServer(); client = api(srv.url); });
test.after(async () => { await srv.stop(); });

test('connect: new licence creates a company; same PC reconnects with a new key; other PC refused', async () => {
  assert.strictEqual((await sync('POST', '/connect', null, { machineId: 'PC-1' })).status, 400);
  const c1 = await sync('POST', '/connect', null, { licenseKey: 'EF-LIC-0001', machineId: 'PC-1', companyName: 'Ramesh Textiles' });
  assert.strictEqual(c1.body.data.created, true);
  assert.match(c1.body.data.orgCode, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.match(c1.body.data.syncKey, /^efs_/);

  const c2 = await sync('POST', '/connect', null, { licenseKey: 'EF-LIC-0001', machineId: 'PC-1' });
  assert.strictEqual(c2.body.data.created, false);
  assert.strictEqual(c2.body.data.orgCode, c1.body.data.orgCode);
  assert.strictEqual((await sync('GET', '/status', c1.body.data.syncKey)).status, 401);   // old key retired
  assert.strictEqual((await sync('GET', '/status', c2.body.data.syncKey)).status, 200);

  const other = await sync('POST', '/connect', null, { licenseKey: 'EF-LIC-0001', machineId: 'PC-2' });
  assert.deepStrictEqual([other.status, other.body.error], [409, 'ALREADY_LINKED']);
  edge = c2.body.data;
});

test('employees: snapshot upserts, maps roles, logs in with the EDGE password', async () => {
  const r = await sync('PUT', '/employees', edge.syncKey, { employees: employees([{ empCode: 'NOID', name: 'bad' }]) });
  assert.deepStrictEqual(r.body.data, { upserted: 2, skipped: 1, deactivated: 0, activeCount: 2 });
  const chk = await client.get('/api/v1/apk/login-check', { orgCode: edge.orgCode, query: { empCode: 'r@x.com' } });
  assert.deepStrictEqual(chk.body.data, { allowed: true, role: 'employee' });
  const t = await client.login(edge.orgCode, 'E002', 'edge-pass');
  const me = await client.get('/api/v1/apk/employees', { token: t });
  assert.strictEqual(me.status, 200);   // hr-admin role came through
});

test('employees: a password changed in the app survives the next EDGE push; an EDGE reset is applied', async () => {
  const t = await client.login(edge.orgCode, 'E001', 'edge-pass');
  await client.post('/api/v1/auth/change-password', { token: t, body: { currentPassword: 'edge-pass', newPassword: 'app-pass' } });
  await sync('PUT', '/employees', edge.syncKey, { employees: employees() });          // same EDGE hash again
  await client.login(edge.orgCode, 'E001', 'app-pass');                                // still the app password

  const reset = hashSecret('hr-reset');
  const list = employees(); list[0].passwordHash = reset; list[0].passwordMustChange = true;
  await sync('PUT', '/employees', edge.syncKey, { employees: list });                  // HR changed it in EDGE
  const login = await client.post('/api/v1/apk/auth/login', { orgCode: edge.orgCode, body: { empCode: 'E001', password: 'hr-reset' } });
  assert.strictEqual(login.body.data.user.passwordMustChange, true);
});

test('employees: someone EDGE stops listing is deactivated and can no longer log in', async () => {
  const r = await sync('PUT', '/employees', edge.syncKey, { employees: employees().slice(1) });
  assert.strictEqual(r.body.data.deactivated, 1);
  const login = await client.post('/api/v1/apk/auth/login', { orgCode: edge.orgCode, body: { empCode: 'E001', password: 'hr-reset' } });
  assert.strictEqual(login.status, 401);
  await sync('PUT', '/employees', edge.syncKey, { employees: employees() });             // back again
});

test('reference: holidays and offices replace the old set; geofence can be enforced', async () => {
  const r = await sync('PUT', '/reference', edge.syncKey, {
    companyName: 'Ramesh Textiles Pvt Ltd', weeklyOffDays: [0],
    holidays: [{ date: '2026-11-08', name: 'Diwali' }, { date: 'bad' }],
    offices: [{ id: 'HQ', label: 'Head office', lat: 26.9124, lng: 75.7873, radiusM: 150 }],
    enforceGeofence: true,
  });
  assert.deepStrictEqual([r.body.data.holidays, r.body.data.offices], [1, 1]);
  const offices = await client.get('/api/v1/apk/offices', { orgCode: edge.orgCode });
  assert.strictEqual(offices.body.data[0].label, 'Head office');

  const t = await client.login(edge.orgCode, 'E002', 'edge-pass');
  const far = await client.post('/api/v1/apk/attendance', { token: t, body: punchBody('EMP-002', '2026-11-02T03:30:00.000Z', { location: { lat: 28.6, lon: 77.2, accuracy: 10 } }) });
  assert.deepStrictEqual([far.status, far.body.error], [422, 'OUTSIDE_GEOFENCE']);
  const near = await client.post('/api/v1/apk/attendance', { token: t, body: punchBody('EMP-002', '2026-11-02T03:30:00.000Z', { location: { lat: 26.9125, lon: 75.7874, accuracy: 10 } }) });
  assert.strictEqual(near.body.ok, true);
  const tour = await client.post('/api/v1/apk/attendance/checkout', { token: t, body: { timestamp: '2026-11-02T12:00:00.000Z' } });
  assert.strictEqual(tour.body.ok, true);
});

test('punches: paged pull by sequence, then ack', async () => {
  const p1 = await sync('GET', '/punches?after=0&limit=1', edge.syncKey);
  assert.strictEqual(p1.body.data.punches.length, 1);
  assert.deepStrictEqual([p1.body.data.punches[0].eventType, p1.body.data.punches[0].time, p1.body.data.hasMore], ['in', '09:00:00', true]);
  const p2 = await sync('GET', `/punches?after=${p1.body.data.nextCursor}`, edge.syncKey);
  assert.deepStrictEqual(p2.body.data.punches.map((p) => [p.eventType, p.time]), [['out', '17:30:00']]);
  assert.strictEqual(p2.body.data.hasMore, false);
  const done = await sync('GET', `/punches?after=${p2.body.data.nextCursor}`, edge.syncKey);
  assert.deepStrictEqual([done.body.data.punches.length, done.body.data.nextCursor], [0, p2.body.data.nextCursor]);
  const ack = await sync('POST', '/ack', edge.syncKey, { cursor: p2.body.data.nextCursor });
  assert.strictEqual(ack.body.data.ackedSeq, 2);
  const st = await sync('GET', '/status', edge.syncKey);
  assert.deepStrictEqual([st.body.data.latestSeq, st.body.data.ackedSeq, st.body.data.companyName], [2, 2, 'Ramesh Textiles Pvt Ltd']);
});

test('shifts: EDGE office hours + shifts become read-only cloud shifts; employees follow their EDGE shift', async () => {
  const list = employees(); list[0].shiftId = null; list[1].shiftId = 'SHIFT-N';
  await sync('PUT', '/employees', edge.syncKey, { employees: list });                   // before the shift exists
  const r = await sync('PUT', '/reference', edge.syncKey, {
    weeklyOffDays: [0, 6],
    workingHours: { start: '09:00:00', end: '18:00', breakMinutes: 60 },
    shifts: [{ id: 'SHIFT-N', name: 'Shop floor', start: '09:00', end: '17:30', breakMinutes: 45, graceMinutes: 5 }, { id: 'BAD', start: 'x' }],
  });
  assert.strictEqual(r.body.data.shifts, 1);
  const t = await client.login(edge.orgCode, 'E002', 'edge-pass');
  const shifts = (await client.get('/api/v1/apk/shifts', { token: t })).body.data;
  const def = shifts.find((s) => s.isDefault), floor = shifts.find((s) => s.name === 'Shop floor');
  assert.deepStrictEqual([def.start, def.end, def.breakStart, def.breakMinutes, def.weeklyOff], ['09:00', '18:00', null, 60, [0, 6]]);
  assert.deepStrictEqual([floor.end, floor.breakMinutes, floor.graceMinutes, floor.weeklyOff, floor.fromPc, floor.employees], ['17:30', 45, 5, [0, 6], true, 1]);
  const edit = await client.post('/api/v1/apk/shifts', { token: t, body: { name: 'X', start: '08:00', end: '16:00' } });
  assert.deepStrictEqual([edit.status, edit.body.error], [409, 'MANAGED_IN_EDGE']);

  // 09:00–17:30 = 510 min; the 45-min lunch of Shop floor is deducted.
  const cal = async () => (await client.get('/api/v1/apk/attendance-calendar', { token: t, query: { month: '2026-11' } })).body;
  let c = await cal();
  assert.strictEqual(c.meta.shift.name, 'Shop floor');
  assert.deepStrictEqual(['grossMinutes', 'breakMinutes', 'netMinutes'].map((k) => c.data.find((d) => d.date === '2026-11-02')[k]), [510, 45, 465]);

  // Shift removed in EDGE → the employee falls back to the default (office hours, 60-min lunch).
  await sync('PUT', '/reference', edge.syncKey, { workingHours: { start: '09:00', end: '18:00', breakMinutes: 60 }, shifts: [] });
  c = await cal();
  assert.strictEqual(c.meta.shift.id, def.id);
  assert.strictEqual(c.data.find((d) => d.date === '2026-11-02').netMinutes, 450);
});

test('isolation: another company\'s sync key never sees these punches or employees', async () => {
  const other = await sync('POST', '/connect', null, { licenseKey: 'EF-LIC-0002', machineId: 'PC-9', companyName: 'Other' });
  const pulled = await sync('GET', '/punches?after=0', other.body.data.syncKey);
  assert.strictEqual(pulled.body.data.punches.length, 0);
  const st = await sync('GET', '/status', other.body.data.syncKey);
  assert.strictEqual(st.body.data.activeEmployees, 0);
  assert.strictEqual((await sync('GET', '/punches?after=0', 'efs_not-a-key')).status, 401);
});
