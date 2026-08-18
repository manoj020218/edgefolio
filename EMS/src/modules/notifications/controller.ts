import type { Request } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { sendSuccess } from '../../lib/http';
import { takeString } from '../../lib/request-value';
import { getCompanyScope, getUserAuth } from '../../lib/scope';
import { logAudit } from '../audit/service';
import { acknowledgeCommand, createCommand, listCommands } from './service';

export const createCommandController = asyncHandler(async (req: Request, res) => {
  const auth = getUserAuth(req);
  const companyId = getCompanyScope(req)!;
  const command = await createCommand({ companyId, ...req.body });
  await logAudit({ companyId, actorUserId: auth.userId, action: 'notification.command', entityType: 'notification', entityId: String(command._id), metadata: { commandType: command.commandType } });
  sendSuccess(res, command);
});

export const listCommandsController = asyncHandler(async (req: Request, res) => {
  const scope = req.auth?.kind === 'device'
    ? { companyId: req.auth.companyId, deviceId: req.auth.deviceId }
    : { companyId: getCompanyScope(req)!, userId: getUserAuth(req).userId };
  sendSuccess(res, await listCommands(scope));
});

export const acknowledgeCommandController = asyncHandler(async (req: Request, res) => {
  const companyId = req.auth?.kind === 'device' ? req.auth.companyId : getCompanyScope(req)!;
  sendSuccess(res, await acknowledgeCommand(companyId, takeString(req.params.id)!));
});
