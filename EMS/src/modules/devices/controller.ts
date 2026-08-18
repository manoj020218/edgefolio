import type { Request } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { sendSuccess } from '../../lib/http';
import { takeString } from '../../lib/request-value';
import { getCompanyScope, getUserAuth } from '../../lib/scope';
import { logAudit } from '../audit/service';
import { assignDevice, getDeviceStatus, listDevices, registerDevice, unassignDevice, updateFcmToken } from './service';

export const registerDeviceController = asyncHandler(async (req: Request, res) => {
  const auth = getUserAuth(req);
  const companyId = getCompanyScope(req)!;
  const employeeId = auth.employeeId && auth.role === 'EMPLOYEE' ? auth.employeeId : req.body.employeeId;
  const result = await registerDevice({ ...req.body, companyId, employeeId });
  await logAudit({ companyId, actorUserId: auth.userId, action: 'device.register', entityType: 'device', entityId: req.body.deviceId });
  sendSuccess(res, result);
});

export const listDevicesController = asyncHandler(async (req: Request, res) => {
  sendSuccess(res, await listDevices(getCompanyScope(req)!));
});

export const assignDeviceController = asyncHandler(async (req: Request, res) => {
  const auth = getUserAuth(req);
  const companyId = getCompanyScope(req)!;
  const deviceId = takeString(req.params.deviceId)!;
  const device = await assignDevice(companyId, deviceId, req.body.employeeId);
  await logAudit({ companyId, actorUserId: auth.userId, action: 'device.assign', entityType: 'device', entityId: deviceId, metadata: { employeeId: req.body.employeeId } });
  sendSuccess(res, device);
});

export const unassignDeviceController = asyncHandler(async (req: Request, res) => {
  const auth = getUserAuth(req);
  const companyId = getCompanyScope(req)!;
  const deviceId = takeString(req.params.deviceId)!;
  const device = await unassignDevice(companyId, deviceId);
  await logAudit({ companyId, actorUserId: auth.userId, action: 'device.unassign', entityType: 'device', entityId: deviceId });
  sendSuccess(res, device);
});

export const updateFcmTokenController = asyncHandler(async (req: Request, res) => {
  const companyId = req.auth?.kind === 'device' ? req.auth.companyId : getCompanyScope(req)!;
  const deviceId = req.auth?.kind === 'device' ? req.auth.deviceId : takeString(req.params.deviceId)!;
  sendSuccess(res, await updateFcmToken(companyId, deviceId, req.body.fcmToken));
});

export const getDeviceStatusController = asyncHandler(async (req: Request, res) => {
  sendSuccess(res, await getDeviceStatus(getCompanyScope(req)!, takeString(req.params.deviceId)!));
});
