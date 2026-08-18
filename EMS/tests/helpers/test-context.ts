import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

let mongod: MongoMemoryServer | null = null;
let appInstance: ReturnType<typeof request> | null = null;

function applyEnv(uri: string) {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '4100';
  process.env.MONGODB_URI = uri;
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-12345';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-12345';
  process.env.JWT_DEVICE_SECRET = 'test-device-secret-12345';
  process.env.ACCESS_TOKEN_TTL = '15m';
  process.env.REFRESH_TOKEN_TTL_DAYS = '30';
  process.env.DEVICE_TOKEN_TTL_DAYS = '180';
  process.env.AUTH_RATE_LIMIT_MAX = '100';
  process.env.CORS_ORIGINS = 'http://localhost:5173';
  process.env.SUPER_ADMIN_EMAIL = 'root@example.com';
  process.env.SUPER_ADMIN_PASSWORD = 'Password123!';
}

export async function bootstrapApp() {
  if (!mongod) {
    mongod = await MongoMemoryServer.create();
    applyEnv(mongod.getUri());
    const { connectDatabase } = await import('../../src/config/db');
    const { createApp } = await import('../../src/app');
    await connectDatabase();
    appInstance = request(createApp());
  }
  return appInstance!;
}

export async function clearDatabase() {
  for (const collection of Object.values(mongoose.connection.collections)) {
    await collection.deleteMany({});
  }
}

export async function shutdownApp() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  mongod = null;
  appInstance = null;
}

export async function createFixtures() {
  const { Company } = await import('../../src/modules/companies/model');
  const { User } = await import('../../src/modules/users/model');
  const { Employee } = await import('../../src/modules/employees/model');
  const { Device } = await import('../../src/modules/devices/model');
  const { hashPassword } = await import('../../src/lib/crypto');
  const { signAccessToken, signDeviceToken } = await import('../../src/lib/jwt');

  async function company(code: string, name = code) {
    return Company.create({ code, name, timezone: 'Asia/Kolkata', status: 'active' });
  }

  async function user(input: { companyId?: string; role: string; email: string; name: string; password?: string; status?: string }) {
    return User.create({
      ...input,
      passwordHash: await hashPassword(input.password ?? 'Password123!'),
      status: input.status ?? 'active',
    });
  }

  async function employee(input: { companyId: string; userId: string; code: string }) {
    return Employee.create({
      companyId: input.companyId,
      userId: input.userId,
      employeeCode: input.code,
      designation: 'Sales Executive',
      department: 'Sales',
      joiningDate: new Date('2026-01-01T00:00:00.000Z'),
      status: 'active',
    });
  }

  async function device(input: { companyId: string; employeeId?: string; deviceId: string }) {
    return Device.create({ companyId: input.companyId, employeeId: input.employeeId, deviceId: input.deviceId, platform: 'android', managed: true, status: 'active' });
  }

  function accessToken(userDoc: { _id: unknown; companyId?: unknown; role: string }, employeeId?: string) {
    return signAccessToken({ userId: String(userDoc._id), companyId: userDoc.companyId ? String(userDoc.companyId) : undefined, employeeId, role: userDoc.role as never });
  }

  function deviceToken(doc: { deviceId: string; companyId: unknown; employeeId?: unknown }) {
    return signDeviceToken({ deviceId: doc.deviceId, companyId: String(doc.companyId), employeeId: doc.employeeId ? String(doc.employeeId) : undefined });
  }

  return { company, user, employee, device, accessToken, deviceToken };
}
