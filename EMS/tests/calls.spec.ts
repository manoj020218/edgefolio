import { bootstrapApp, clearDatabase, createFixtures, shutdownApp } from './helpers/test-context';

describe('calls ingestion', () => {
  function isoMinutesAgo(minutes: number) {
    return new Date(Date.now() - minutes * 60 * 1000).toISOString();
  }

  beforeAll(async () => {
    await bootstrapApp();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('call ingest is idempotent by deviceId and externalCallId', async () => {
    const app = await bootstrapApp();
    const fx = await createFixtures();
    const company = await fx.company('JULIET');
    const user = await fx.user({ companyId: String(company._id), role: 'EMPLOYEE', email: 'emp@juliet.test', name: 'Emp' });
    const employee = await fx.employee({ companyId: String(company._id), userId: String(user._id), code: 'EMP-J' });
    const device = await fx.device({ companyId: String(company._id), employeeId: String(employee._id), deviceId: 'device-j1' });
    const token = fx.deviceToken(device);
    const startedAt = isoMinutesAgo(30);
    const endedAt = isoMinutesAgo(28);

    const first = await app.post('/api/v1/calls/ingest').set('Authorization', `Bearer ${token}`).send({
      externalCallId: 'call-1',
      phoneNumber: '9999999999',
      direction: 'outgoing',
      status: 'answered',
      startedAt,
      durationSeconds: 20,
    });
    const second = await app.post('/api/v1/calls/ingest').set('Authorization', `Bearer ${token}`).send({
      externalCallId: 'call-1',
      phoneNumber: '9999999999',
      direction: 'outgoing',
      status: 'answered',
      startedAt,
      endedAt,
      durationSeconds: 120,
    });
    const summary = await app.get('/api/v1/calls/summary/daily')
      .set('Authorization', `Bearer ${fx.accessToken(user, String(employee._id))}`)
      .query({ employeeId: String(employee._id) });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.durationSeconds).toBe(120);
    expect(summary.body.data.answered).toBe(1);
    expect(summary.body.data.totalTalkTime).toBe(120);
  });
});
