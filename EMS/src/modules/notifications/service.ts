import { NotificationCommand } from './model';

export async function createCommand(input: Record<string, unknown>) {
  return NotificationCommand.create(input);
}

export async function listCommands(scope: { companyId: string; userId?: string; deviceId?: string }) {
  return NotificationCommand.find({
    companyId: scope.companyId,
    ...(scope.userId ? { $or: [{ targetUserId: scope.userId }, { targetUserId: { $exists: false } }] } : {}),
    ...(scope.deviceId ? { $or: [{ targetDeviceId: scope.deviceId }, { targetDeviceId: { $exists: false } }] } : {}),
  }).sort({ createdAt: -1 }).lean();
}

export async function acknowledgeCommand(companyId: string, id: string) {
  return NotificationCommand.findOneAndUpdate(
    { _id: id, companyId },
    { status: 'acknowledged', acknowledgedAt: new Date() },
    { new: true },
  );
}
