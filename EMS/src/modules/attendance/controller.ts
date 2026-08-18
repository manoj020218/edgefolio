import type { Request } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { resolveEmployeeActor } from '../../lib/actor-scope';
import { sendSuccess } from '../../lib/http';
import { getCompanyScope, getEmployeeScope, getUserAuth } from '../../lib/scope';
import { logAudit } from '../audit/service';
import { attendanceHistory, checkIn, checkOut, todayAttendance } from './service';

export const checkInController = asyncHandler(async (req: Request, res) => {
  const actor = resolveEmployeeActor(req, req.body.employeeId, req.body.deviceId);
  const session = await checkIn(actor, req.body);
  if (req.auth?.kind === 'user') await logAudit({ companyId: actor.companyId, actorUserId: req.auth.userId, action: 'attendance.checkin', entityType: 'attendance', entityId: String(session._id) });
  sendSuccess(res, session);
});

export const checkOutController = asyncHandler(async (req: Request, res) => {
  const actor = resolveEmployeeActor(req, req.body.employeeId, req.body.deviceId);
  const session = await checkOut(actor, req.body);
  if (req.auth?.kind === 'user') await logAudit({ companyId: actor.companyId, actorUserId: req.auth.userId, action: 'attendance.checkout', entityType: 'attendance', entityId: String(session._id) });
  sendSuccess(res, session);
});

export const todayAttendanceController = asyncHandler(async (req: Request, res) => {
  const auth = getUserAuth(req);
  sendSuccess(res, await todayAttendance(getCompanyScope(req)!, getEmployeeScope(req, req.query.employeeId as string | undefined) ?? auth.employeeId!));
});

export const attendanceHistoryController = asyncHandler(async (req: Request, res) => {
  const auth = getUserAuth(req);
  const employeeId = getEmployeeScope(req, req.query.employeeId as string | undefined) ?? auth.employeeId!;
  sendSuccess(res, await attendanceHistory(getCompanyScope(req)!, employeeId, req.query.start as string | undefined, req.query.end as string | undefined, Number(req.query.limit), Number(req.query.page)));
});
