import { AppError, assertFound } from '../../lib/errors';
import { signDeviceToken } from '../../lib/jwt';
import { DeviceHealth } from '../device-health/model';
import { Employee } from '../employees/model';
import { Device } from './model';

const OFFLINE_MS = 10 * 60 * 1000;

export async function registerDevice(input: {
  companyId: string;
  employeeId?: string;
  deviceId: string;
  platform: string;
  manufacturer?: string;
  model?: string;
  androidVersion?: string;
  appVersion?: string;
  deviceName?: string;
  fcmToken?: string;
  managed: boolean;
}) {
  if (input.employeeId) {
    const employee = await Employee.findOne({ _id: input.employeeId, companyId: input.companyId });
    if (!employee) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');
  }
  const device = await Device.findOneAndUpdate(
    { deviceId: input.deviceId },
    { ...input, lastSeenAt: new Date(), status: 'active' },
    { upsert: true, new: true },
  );
  const deviceToken = signDeviceToken({
    deviceId: device.deviceId,
    companyId: String(device.companyId),
    employeeId: device.employeeId ? String(device.employeeId) : undefined,
  });
  return { device, deviceToken };
}

export async function listDevices(companyId: string) {
  return Device.find({ companyId }).sort({ createdAt: -1 }).lean();
}

export async function assignDevice(companyId: string, deviceId: string, employeeId: string) {
  const employee = await Employee.findOne({ _id: employeeId, companyId });
  if (!employee) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');
  const device = await Device.findOneAndUpdate({ companyId, deviceId }, { employeeId }, { new: true });
  return assertFound(device, 'DEVICE_NOT_FOUND', 'Device not found');
}

export async function unassignDevice(companyId: string, deviceId: string) {
  const device = await Device.findOneAndUpdate(
    { companyId, deviceId },
    { $unset: { employeeId: 1 } },
    { new: true },
  );
  return assertFound(device, 'DEVICE_NOT_FOUND', 'Device not found');
}

export async function updateFcmToken(companyId: string, deviceId: string, fcmToken: string) {
  const device = await Device.findOneAndUpdate({ companyId, deviceId }, { fcmToken }, { new: true });
  return assertFound(device, 'DEVICE_NOT_FOUND', 'Device not found');
}

export async function getDeviceStatus(companyId: string, deviceId: string) {
  const device = assertFound(await Device.findOne({ companyId, deviceId }).lean(), 'DEVICE_NOT_FOUND', 'Device not found');
  const health = await DeviceHealth.findOne({ deviceId }).lean();
  const offline = !device.lastSeenAt || Date.now() - new Date(device.lastSeenAt).getTime() > OFFLINE_MS;
  return { ...device, offline, health };
}
