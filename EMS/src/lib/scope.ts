import type { Request } from 'express';
import { AppError } from './errors';
import { takeString } from './request-value';

export function getUserAuth(req: Request) {
  if (req.auth?.kind !== 'user') throw new AppError(403, 'USER_ONLY', 'User session required');
  return req.auth;
}

export function getCompanyScope(req: Request, requestedCompanyId?: unknown) {
  const auth = getUserAuth(req);
  if (auth.role === 'SUPER_ADMIN') return takeString(requestedCompanyId);
  if (!auth.companyId) throw new AppError(400, 'COMPANY_SCOPE_MISSING', 'Company scope is required');
  return auth.companyId;
}

export function getEmployeeScope(req: Request, requestedEmployeeId?: unknown) {
  const auth = getUserAuth(req);
  if (auth.role === 'EMPLOYEE') {
    if (!auth.employeeId) throw new AppError(403, 'EMPLOYEE_PROFILE_REQUIRED', 'Employee profile required');
    return auth.employeeId;
  }
  return takeString(requestedEmployeeId);
}
