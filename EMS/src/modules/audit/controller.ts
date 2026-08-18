import type { Request } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { sendSuccess } from '../../lib/http';
import { getCompanyScope } from '../../lib/scope';
import { AuditLog } from './model';

export const listAuditController = asyncHandler(async (req: Request, res) => {
  const companyId = getCompanyScope(req);
  sendSuccess(res, await AuditLog.find(companyId ? { companyId } : {}).sort({ timestamp: -1 }).limit(100).lean());
});
