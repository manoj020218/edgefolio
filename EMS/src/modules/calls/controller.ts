import type { Request } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { resolveEmployeeActor } from '../../lib/actor-scope';
import { sendSuccess } from '../../lib/http';
import { getCompanyScope, getEmployeeScope } from '../../lib/scope';
import { logAudit } from '../audit/service';
import { dailySummary, ingestCall, listCalls } from './service';

export const ingestCallController = asyncHandler(async (req: Request, res) => {
  const actor = resolveEmployeeActor(req, req.body.employeeId, req.body.deviceId);
  const call = await ingestCall(actor, req.body);
  if (req.auth?.kind === 'user') await logAudit({ companyId: actor.companyId, actorUserId: req.auth.userId, action: 'call.ingest', entityType: 'call', entityId: String(call?._id) });
  sendSuccess(res, call);
});

export const listCallsController = asyncHandler(async (req: Request, res) => {
  sendSuccess(res, await listCalls(getCompanyScope(req)!, getEmployeeScope(req, req.query.employeeId as string | undefined), req.query.start as string | undefined, req.query.end as string | undefined, Number(req.query.limit), Number(req.query.page)));
});

export const dailySummaryController = asyncHandler(async (req: Request, res) => {
  sendSuccess(res, await dailySummary(getCompanyScope(req)!, getEmployeeScope(req, req.query.employeeId as string | undefined), req.query.start as string | undefined, req.query.end as string | undefined));
});
