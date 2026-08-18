import type { Request } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { resolveEmployeeActor } from '../../lib/actor-scope';
import { sendSuccess } from '../../lib/http';
import { takeString } from '../../lib/request-value';
import { getCompanyScope, getEmployeeScope, getUserAuth } from '../../lib/scope';
import { logAudit } from '../audit/service';
import { checkInVisit, checkOutVisit, listVisits } from './service';

export const visitCheckInController = asyncHandler(async (req: Request, res) => {
  const actor = resolveEmployeeActor(req, req.body.employeeId);
  const visit = await checkInVisit(actor, req.body);
  if (req.auth?.kind === 'user') await logAudit({ companyId: actor.companyId, actorUserId: req.auth.userId, action: 'visit.checkin', entityType: 'visit', entityId: String(visit._id) });
  sendSuccess(res, visit);
});

export const visitCheckOutController = asyncHandler(async (req: Request, res) => {
  const auth = getUserAuth(req);
  const companyId = getCompanyScope(req)!;
  const visitId = takeString(req.params.id)!;
  const visit = await checkOutVisit(companyId, visitId, req.body);
  await logAudit({ companyId, actorUserId: auth.userId, action: 'visit.checkout', entityType: 'visit', entityId: visitId });
  sendSuccess(res, visit);
});

export const listVisitsController = asyncHandler(async (req: Request, res) => {
  sendSuccess(res, await listVisits(getCompanyScope(req)!, getEmployeeScope(req, req.query.employeeId as string | undefined), req.query.start as string | undefined, req.query.end as string | undefined, Number(req.query.limit), Number(req.query.page)));
});
