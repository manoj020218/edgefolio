import type { Request } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { sendSuccess } from '../../lib/http';
import { takeString } from '../../lib/request-value';
import { getCompanyScope, getUserAuth } from '../../lib/scope';
import { logAudit } from '../audit/service';
import { createCompany, listCompanies, updateCompany } from './service';

export const createCompanyController = asyncHandler(async (req: Request, res) => {
  const auth = getUserAuth(req);
  const company = await createCompany(req.body);
  await logAudit({ actorUserId: auth.userId, action: 'company.create', entityType: 'company', entityId: String(company._id) });
  sendSuccess(res, company);
});

export const listCompaniesController = asyncHandler(async (req: Request, res) => {
  sendSuccess(res, await listCompanies(getCompanyScope(req, req.query.companyId as string | undefined)));
});

export const updateCompanyController = asyncHandler(async (req: Request, res) => {
  const auth = getUserAuth(req);
  const companyId = takeString(req.params.id)!;
  const company = await updateCompany(companyId, req.body);
  await logAudit({ actorUserId: auth.userId, action: 'company.update', entityType: 'company', entityId: companyId });
  sendSuccess(res, company);
});
