import mongoose from 'mongoose';
import { CallRecord } from './model';

export async function ingestCall(scope: { companyId: string; employeeId: string; deviceId?: string }, input: Record<string, unknown>) {
  return CallRecord.findOneAndUpdate(
    { deviceId: scope.deviceId, externalCallId: input.externalCallId },
    { companyId: scope.companyId, employeeId: scope.employeeId, deviceId: scope.deviceId, ...input },
    { upsert: true, new: true },
  );
}

export async function listCalls(companyId: string, employeeId?: string, start?: string, end?: string, limit = 20, page = 1) {
  const filter: Record<string, unknown> = { companyId, ...(employeeId ? { employeeId } : {}) };
  if (start || end) filter.startedAt = { ...(start ? { $gte: new Date(start) } : {}), ...(end ? { $lte: new Date(end) } : {}) };
  return CallRecord.find(filter).sort({ startedAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
}

export async function dailySummary(companyId: string, employeeId?: string, start?: string, end?: string) {
  const match: Record<string, unknown> = {
    companyId: new mongoose.Types.ObjectId(companyId),
    ...(employeeId ? { employeeId: new mongoose.Types.ObjectId(employeeId) } : {}),
  };
  if (start || end) match.startedAt = { ...(start ? { $gte: new Date(start) } : {}), ...(end ? { $lte: new Date(end) } : {}) };
  const rows = await CallRecord.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        incoming: { $sum: { $cond: [{ $eq: ['$direction', 'incoming'] }, 1, 0] } },
        outgoing: { $sum: { $cond: [{ $eq: ['$direction', 'outgoing'] }, 1, 0] } },
        missed: { $sum: { $cond: [{ $eq: ['$status', 'missed'] }, 1, 0] } },
        answered: { $sum: { $cond: [{ $eq: ['$status', 'answered'] }, 1, 0] } },
        totalTalkTime: { $sum: '$durationSeconds' },
      },
    },
  ]);
  return rows[0] ?? { incoming: 0, outgoing: 0, missed: 0, answered: 0, totalTalkTime: 0 };
}
