import type { Request } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { sendSuccess } from '../../lib/http';
import { takeString } from '../../lib/request-value';
import { getCompanyScope } from '../../lib/scope';
import { currentHealth, heartbeat } from './service';

export const heartbeatController = asyncHandler(async (req: Request, res) => {
  const scope = req.auth?.kind === 'device'
    ? { companyId: req.auth.companyId, employeeId: req.auth.employeeId, deviceId: req.auth.deviceId }
    : { companyId: getCompanyScope(req)!, employeeId: req.body.employeeId, deviceId: req.body.deviceId };
  sendSuccess(res, await heartbeat(scope, req.body));
});

export const currentHealthController = asyncHandler(async (req: Request, res) => {
  sendSuccess(res, await currentHealth(getCompanyScope(req)!, takeString(req.params.deviceId)!));
});
