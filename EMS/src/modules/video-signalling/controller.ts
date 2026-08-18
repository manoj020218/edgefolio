import type { Request } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { sendSuccess } from '../../lib/http';
import { takeString } from '../../lib/request-value';
import { getCompanyScope, getUserAuth } from '../../lib/scope';
import { logAudit } from '../audit/service';
import { answerSession, createSession, endSession, listSessions } from './service';

export const createSessionController = asyncHandler(async (req: Request, res) => {
  const auth = getUserAuth(req);
  const companyId = getCompanyScope(req)!;
  const session = await createSession({ companyId, callerUserId: auth.userId, calleeUserId: req.body.calleeUserId, sessionId: req.body.sessionId });
  await logAudit({ companyId, actorUserId: auth.userId, action: 'video.create', entityType: 'videoSession', entityId: String(session._id) });
  sendSuccess(res, session);
});

export const answerSessionController = asyncHandler(async (req: Request, res) => {
  sendSuccess(res, await answerSession(getCompanyScope(req)!, takeString(req.params.id)!));
});

export const endSessionController = asyncHandler(async (req: Request, res) => {
  sendSuccess(res, await endSession(getCompanyScope(req)!, takeString(req.params.id)!));
});

export const listSessionsController = asyncHandler(async (req: Request, res) => {
  sendSuccess(res, await listSessions(getCompanyScope(req)!, getUserAuth(req).userId));
});
