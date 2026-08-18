import { bootstrapApp, clearDatabase, createFixtures, shutdownApp } from './helpers/test-context';

describe('auth and tenant controls', () => {
  beforeAll(async () => {
    await bootstrapApp();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('login returns access and refresh tokens', async () => {
    const app = await bootstrapApp();
    const fx = await createFixtures();
    const company = await fx.company('ALPHA');
    await fx.user({ companyId: String(company._id), role: 'COMPANY_ADMIN', email: 'admin@alpha.test', name: 'Admin' });

    const response = await app.post('/api/v1/auth/login').send({ email: 'admin@alpha.test', password: 'Password123!' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.accessToken).toBeTruthy();
    expect(response.body.data.refreshToken).toBeTruthy();
  });

  test('employee role cannot access admin user list', async () => {
    const app = await bootstrapApp();
    const fx = await createFixtures();
    const company = await fx.company('BRAVO');
    const user = await fx.user({ companyId: String(company._id), role: 'EMPLOYEE', email: 'staff@bravo.test', name: 'Staff' });
    const employee = await fx.employee({ companyId: String(company._id), userId: String(user._id), code: 'EMP-1' });

    const response = await app.get('/api/v1/users').set('Authorization', `Bearer ${fx.accessToken(user, String(employee._id))}`);

    expect(response.status).toBe(403);
  });

  test('company admin cannot create super admin', async () => {
    const app = await bootstrapApp();
    const fx = await createFixtures();
    const company = await fx.company('CHARLIE');
    const admin = await fx.user({ companyId: String(company._id), role: 'COMPANY_ADMIN', email: 'admin@charlie.test', name: 'Admin' });

    const response = await app.post('/api/v1/users')
      .set('Authorization', `Bearer ${fx.accessToken(admin)}`)
      .send({ name: 'Root 2', email: 'root2@test.com', password: 'Password123!', role: 'SUPER_ADMIN' });

    expect(response.status).toBe(403);
  });

  test('cross-company employee lookup is blocked', async () => {
    const app = await bootstrapApp();
    const fx = await createFixtures();
    const companyA = await fx.company('DELTA');
    const companyB = await fx.company('ECHO');
    const adminA = await fx.user({ companyId: String(companyA._id), role: 'COMPANY_ADMIN', email: 'admin@delta.test', name: 'Admin A' });
    const userB = await fx.user({ companyId: String(companyB._id), role: 'EMPLOYEE', email: 'user@echo.test', name: 'User B' });
    const employeeB = await fx.employee({ companyId: String(companyB._id), userId: String(userB._id), code: 'EMP-B' });

    const response = await app.get(`/api/v1/employees/${employeeB._id}`)
      .set('Authorization', `Bearer ${fx.accessToken(adminA)}`);

    expect(response.status).toBe(404);
  });
});
