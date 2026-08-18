import { bootstrapApp, clearDatabase, createFixtures, shutdownApp } from './helpers/test-context';

describe('locations and attendance', () => {
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

  test('location batch ingest deduplicates repeated points', async () => {
    const app = await bootstrapApp();
    const fx = await createFixtures();
    const company = await fx.company('FOXTROT');
    const user = await fx.user({ companyId: String(company._id), role: 'EMPLOYEE', email: 'field@foxtrot.test', name: 'Field User' });
    const employee = await fx.employee({ companyId: String(company._id), userId: String(user._id), code: 'EMP-F' });
    const device = await fx.device({ companyId: String(company._id), employeeId: String(employee._id), deviceId: 'android-1' });
    const token = fx.deviceToken(device);
    const point1 = isoMinutesAgo(20);
    const point2 = isoMinutesAgo(15);
    const payload = {
      points: [
        { timestamp: point1, latitude: 26.9, longitude: 75.8, accuracy: 10, speed: 3, heading: 120, battery: 80, mockLocation: false },
        { timestamp: point2, latitude: 26.91, longitude: 75.81, accuracy: 12, speed: 4, heading: 125, battery: 79, mockLocation: false },
      ],
    };

    const first = await app.post('/api/v1/locations/batch').set('Authorization', `Bearer ${token}`).send(payload);
    const second = await app.post('/api/v1/locations/batch').set('Authorization', `Bearer ${token}`).send(payload);

    expect(first.status).toBe(200);
    expect(first.body.data.inserted).toBe(2);
    expect(second.body.data.inserted).toBe(0);
  });

  test('attendance prevents multiple open sessions', async () => {
    const app = await bootstrapApp();
    const fx = await createFixtures();
    const company = await fx.company('GOLF');
    const user = await fx.user({ companyId: String(company._id), role: 'EMPLOYEE', email: 'staff@golf.test', name: 'Staff' });
    const employee = await fx.employee({ companyId: String(company._id), userId: String(user._id), code: 'EMP-G' });
    const token = fx.accessToken(user, String(employee._id));
    const body = { timestamp: isoMinutesAgo(30), location: { latitude: 26.9, longitude: 75.8, accuracy: 12 } };

    const first = await app.post('/api/v1/attendance/check-in').set('Authorization', `Bearer ${token}`).send(body);
    const second = await app.post('/api/v1/attendance/check-in').set('Authorization', `Bearer ${token}`).send(body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
  });
});
