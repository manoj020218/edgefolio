import { Device } from '../devices/model';
import { DeviceHealth } from './model';

const OFFLINE_MS = 10 * 60 * 1000;

export async function heartbeat(scope: { companyId: string; employeeId?: string; deviceId: string }, input: Record<string, unknown>) {
  await Device.findOneAndUpdate(
    { companyId: scope.companyId, deviceId: scope.deviceId },
    { lastSeenAt: new Date(input.timestamp as string), status: 'active', employeeId: scope.employeeId },
  );
  return DeviceHealth.findOneAndUpdate(
    { deviceId: scope.deviceId },
    {
      companyId: scope.companyId,
      employeeId: scope.employeeId,
      ...input,
      lastLocationAt: input.lastLocationAt ? new Date(input.lastLocationAt as string) : undefined,
      offline: false,
    },
    { upsert: true, new: true },
  );
}

export async function currentHealth(companyId: string, deviceId: string) {
  const health = await DeviceHealth.findOne({ companyId, deviceId }).lean();
  if (!health) return null;
  return { ...health, offline: Date.now() - new Date(health.timestamp).getTime() > OFFLINE_MS };
}
