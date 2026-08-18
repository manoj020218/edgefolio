import type { Request } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { sendSuccess } from '../../lib/http';
import { takeString } from '../../lib/request-value';
import { getCompanyScope, getEmployeeScope, getUserAuth } from '../../lib/scope';
import { logAudit } from '../audit/service';
import { createEmployee, getEmployee, listEmployees, updateEmployee } from './service';

export const createEmployeeController = asyncHandler(async (req: Request, res) => {
  const auth = getUserAuth(req);
  const companyId = getCompanyScope(req, req.body.companyId);
  const employee = await createEmployee({ ...req.body, companyId });
  await logAudit({ companyId, actorUserId: auth.userId, action: 'employee.create', entityType: 'employee', entityId: String(employee._id) });
  sendSuccess(res, employee);
});

export const listEmployeesController = asyncHandler(async (req: Request, res) => {
  const companyId = getCompanyScope(req, req.query.companyId as string | undefined);
  sendSuccess(res, await listEmployees(companyId as string, getEmployeeScope(req, req.query.employeeId as string | undefined)));
});

export const getEmployeeController = asyncHandler(async (req: Request, res) => {
  const companyId = getCompanyScope(req);
  sendSuccess(res, await getEmployee(companyId as string, getEmployeeScope(req, takeString(req.params.id))!));
});

export const updateEmployeeController = asyncHandler(async (req: Request, res) => {
  const auth = getUserAuth(req);
  const companyId = getCompanyScope(req);
  const employeeId = takeString(req.params.id)!;
  const employee = await updateEmployee(companyId as string, employeeId, req.body);
  await logAudit({ companyId: companyId as string, actorUserId: auth.userId, action: 'employee.update', entityType: 'employee', entityId: employeeId });
  sendSuccess(res, employee);
});
