import mongoose from 'mongoose';
import { AppError } from '../../lib/errors';
import { LocationPoint } from './model';

function validateTimestamp(input: string) {
  const value = new Date(input);
  const now = Date.now();
  if (Number.isNaN(value.getTime())) throw new AppError(400, 'INVALID_TIMESTAMP', 'Invalid timestamp');
  if (value.getTime() > now + 5 * 60 * 1000) throw new AppError(400, 'FUTURE_TIMESTAMP', 'Future timestamps are not allowed');
  if (value.getTime() < now - 35 * 24 * 60 * 60 * 1000) throw new AppError(400, 'STALE_TIMESTAMP', 'Timestamp is too old');
  return value;
}

export async function ingestLocations(scope: { companyId: string; employeeId: string; deviceId?: string }, points: Array<Record<string, unknown>>) {
  const companyId = new mongoose.Types.ObjectId(scope.companyId);
  const employeeId = new mongoose.Types.ObjectId(scope.employeeId);
  const writes: any[] = points.map((point) => {
    const timestamp = validateTimestamp(String(point.timestamp));
    return {
      updateOne: {
        filter: { companyId, employeeId, deviceId: scope.deviceId, timestamp },
        update: {
          $setOnInsert: {
            companyId,
            employeeId,
            deviceId: scope.deviceId,
            timestamp,
            location: { type: 'Point', coordinates: [Number(point.longitude), Number(point.latitude)] },
            accuracy: Number(point.accuracy),
            speed: point.speed == null ? undefined : Number(point.speed),
            heading: point.heading == null ? undefined : Number(point.heading),
            battery: point.battery == null ? undefined : Number(point.battery),
            mockLocation: Boolean(point.mockLocation),
          },
        },
        upsert: true,
      },
    };
  });
  const result = await LocationPoint.bulkWrite(writes, { ordered: false });
  return { inserted: result.upsertedCount, accepted: points.length };
}

export async function latestEmployeeLocation(companyId: string, employeeId: string) {
  return LocationPoint.findOne({ companyId, employeeId }).sort({ timestamp: -1 }).lean();
}

export async function employeeRoute(companyId: string, employeeId: string, start: string, end: string, limit: number, page: number) {
  return LocationPoint.find({
    companyId,
    employeeId,
    timestamp: { $gte: new Date(start), $lte: new Date(end) },
  }).sort({ timestamp: 1 }).skip((page - 1) * limit).limit(limit).lean();
}

export async function companyLatestLocations(companyId: string) {
  return LocationPoint.aggregate([
    { $match: { companyId: new mongoose.Types.ObjectId(companyId) } },
    { $sort: { timestamp: -1 } },
    { $group: { _id: '$employeeId', latest: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$latest' } },
  ]);
}
