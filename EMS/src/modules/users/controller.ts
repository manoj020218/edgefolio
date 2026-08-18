import type { Request } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { AppError } from '../../lib/errors';
import { sendSuccess } from '../../lib/http';
import { takeString } from '../../lib/request-value';
import { getCompanyScope, getUserAuth } from '../../lib/scope';
import { logAudit } from '../audit/service';
import { createUser, listUsers, updateUser } from './service';

export const createUserController = asyncHandler(async (req: Request, res) => {
  const auth = getUserAuth(req);
  if (req.body.role === 'SUPER_ADMIN' && auth.role !== 'SUPER_ADMIN') {
    throw new AppError(403, 'ROLE_FORBIDDEN', 'Only super admin can create another super admin');
  }
  const companyId = getCompanyScope(req, req.body.companyId);
  const user = await createUser({ ...req.body, companyId });
  await logAudit({
    companyId,
    actorUserId: auth.userId,
    action: 'user.create',
    entityType: 'user',
    entityId: String(user._id),
    metadata: { role: user.role },
  });
  sendSuccess(res, user);
});

export const listUsersController = asyncHandler(async (req: Request, res) => {
  sendSuccess(res, await listUsers(getCompanyScope(req, req.query.companyId as string | undefined)));
});

export const updateUserController = asyncHandler(async (req: Request, res) => {
  const auth = getUserAuth(req);
  const userId = takeString(req.params.id)!;
  const user = await updateUser(userId, req.body);
  await logAudit({
    companyId: user.companyId ? String(user.companyId) : undefined,
    actorUserId: auth.userId,
    action: 'user.update',
    entityType: 'user',
    entityId: userId,
    metadata: { role: user.role, status: user.status },
  });
  sendSuccess(res, user);
});
