import type { Request } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { resolveEmployeeActor } from '../../lib/actor-scope';
import { sendSuccess } from '../../lib/http';
import { getCompanyScope, getEmployeeScope } from '../../lib/scope';
import { logAudit } from '../audit/service';
import { createRecording, listRecordings } from './service';

export const createRecordingController = asyncHandler(async (req: Request, res) => {
  const actor = resolveEmployeeActor(req, req.body.employeeId);
  const recording = await createRecording(actor, req.body);
  if (req.auth?.kind === 'user') await logAudit({ companyId: actor.companyId, actorUserId: req.auth.userId, action: 'recording.create', entityType: 'recording', entityId: String(recording._id) });
  sendSuccess(res, recording);
});

export const listRecordingsController = asyncHandler(async (req: Request, res) => {
  sendSuccess(res, await listRecordings(getCompanyScope(req)!, getEmployeeScope(req, req.query.employeeId as string | undefined), Number(req.query.limit), Number(req.query.page)));
});
