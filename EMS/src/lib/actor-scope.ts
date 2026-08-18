import type { Request } from 'express';
import { AppError } from './errors';
import { getCompanyScope, getUserAuth } from './scope';

export function resolveEmployeeActor(
  req: Request,
  requestedEmployeeId?: string,
  requestedDeviceId?: string,
) {
  if (req.auth?.kind === 'device') {
    if (!req.auth.employeeId) {
      throw new AppError(403, 'DEVICE_UNASSIGNED', 'Device is not assigned to an employee');
    }
    return {
      companyId: req.auth.companyId,
      employeeId: req.auth.employeeId,
      deviceId: req.auth.deviceId,
    };
  }
  const auth = getUserAuth(req);
  const companyId = getCompanyScope(req)!;
  if (auth.role === 'EMPLOYEE') {
    if (!auth.employeeId) throw new AppError(403, 'EMPLOYEE_PROFILE_REQUIRED', 'Employee profile required');
    return { companyId, employeeId: auth.employeeId, deviceId: requestedDeviceId };
  }
  if (!requestedEmployeeId) throw new AppError(400, 'EMPLOYEE_ID_REQUIRED', 'employeeId is required');
  return { companyId, employeeId: requestedEmployeeId, deviceId: requestedDeviceId };
}
