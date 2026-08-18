import { bootstrapApp, clearDatabase, createFixtures, shutdownApp } from './helpers/test-context';

describe('devices and heartbeat', () => {
  beforeAll(async () => {
    await bootstrapApp();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('admin can register and assign a device', async () => {
    const app = await bootstrapApp();
    const fx = await createFixtures();
    const company = await fx.company('HOTEL');
    const admin = await fx.user({ companyId: String(company._id), role: 'COMPANY_ADMIN', email: 'admin@hotel.test', name: 'Admin' });
    const user = await fx.user({ companyId: String(company._id), role: 'EMPLOYEE', email: 'emp@hotel.test', name: 'Emp' });
    const employee = await fx.employee({ companyId: String(company._id), userId: String(user._id), code: 'EMP-H' });
    const adminToken = fx.accessToken(admin);

    const register = await app.post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ deviceId: 'device-h1', platform: 'android', deviceName: 'Pixel' });
    const assign = await app.post('/api/v1/devices/device-h1/assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: String(employee._id) });

    expect(register.status).toBe(200);
    expect(assign.status).toBe(200);
    expect(String(assign.body.data.employeeId)).toBe(String(employee._id));
  });

  test('device heartbeat updates current health state', async () => {
    const app = await bootstrapApp();
    const fx = await createFixtures();
    const company = await fx.company('INDIA');
    const user = await fx.user({ companyId: String(company._id), role: 'EMPLOYEE', email: 'emp@india.test', name: 'Emp' });
    const employee = await fx.employee({ companyId: String(company._id), userId: String(user._id), code: 'EMP-I' });
    const device = await fx.device({ companyId: String(company._id), employeeId: String(employee._id), deviceId: 'device-i1' });
    const admin = await fx.user({ companyId: String(company._id), role: 'COMPANY_ADMIN', email: 'admin@india.test', name: 'Admin' });

    const beat = await app.post('/api/v1/device-health/heartbeat')
      .set('Authorization', `Bearer ${fx.deviceToken(device)}`)
      .send({ timestamp: '2026-08-18T10:10:00.000Z', batteryPercent: 74, gpsEnabled: true, internetAvailable: true, trackingServiceRunning: true });
    const read = await app.get('/api/v1/device-health/device-i1')
      .set('Authorization', `Bearer ${fx.accessToken(admin)}`);

    expect(beat.status).toBe(200);
    expect(read.status).toBe(200);
    expect(read.body.data.batteryPercent).toBe(74);
  });
});
