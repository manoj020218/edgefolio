import { AppError } from '../../lib/errors';
import { endOfDay, startOfDay } from '../../lib/date';
import { AttendanceSession } from './model';

export async function checkIn(scope: { companyId: string; employeeId: string; deviceId?: string }, input: { timestamp: string; location: Record<string, number>; notes?: string }) {
  const existing = await AttendanceSession.findOne({
    companyId: scope.companyId,
    employeeId: scope.employeeId,
    open: true,
  }).select('_id');
  if (existing) {
    throw new AppError(409, 'ATTENDANCE_OPEN_EXISTS', 'Employee already has an open attendance session');
  }
  try {
    return await AttendanceSession.create({
      companyId: scope.companyId,
      employeeId: scope.employeeId,
      deviceId: scope.deviceId,
      checkInAt: new Date(input.timestamp),
      checkInLocation: input.location,
      notes: input.notes,
      open: true,
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new AppError(409, 'ATTENDANCE_OPEN_EXISTS', 'Employee already has an open attendance session');
    }
    throw error;
  }
}

export async function checkOut(scope: { companyId: string; employeeId: string; deviceId?: string }, input: { timestamp: string; location: Record<string, number>; notes?: string }) {
  const session = await AttendanceSession.findOneAndUpdate(
    { companyId: scope.companyId, employeeId: scope.employeeId, open: true },
    { checkOutAt: new Date(input.timestamp), checkOutLocation: input.location, notes: input.notes, open: false },
    { new: true },
  );
  if (!session) throw new AppError(404, 'ATTENDANCE_OPEN_NOT_FOUND', 'No open attendance session found');
  return session;
}

export async function todayAttendance(companyId: string, employeeId: string) {
  return AttendanceSession.find({
    companyId,
    employeeId,
    checkInAt: { $gte: startOfDay(new Date()), $lte: endOfDay(new Date()) },
  }).sort({ checkInAt: -1 }).lean();
}

export async function attendanceHistory(companyId: string, employeeId: string, start?: string, end?: string, limit = 20, page = 1) {
  const filter: Record<string, unknown> = { companyId, employeeId };
  if (start || end) filter.checkInAt = { ...(start ? { $gte: new Date(start) } : {}), ...(end ? { $lte: new Date(end) } : {}) };
  return AttendanceSession.find(filter).sort({ checkInAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
}
