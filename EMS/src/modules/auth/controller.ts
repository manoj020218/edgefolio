import type { Request } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { sendSuccess } from '../../lib/http';
import { getUserAuth } from '../../lib/scope';
import { login, logout, refresh } from './service';

export const loginController = asyncHandler(async (req, res) => {
  sendSuccess(res, await login(req.body));
});

export const refreshController = asyncHandler(async (req, res) => {
  sendSuccess(res, await refresh(req.body.refreshToken));
});

export const logoutController = asyncHandler(async (req, res) => {
  sendSuccess(res, await logout(req.body.refreshToken));
});

export const meController = asyncHandler(async (req: Request, res) => {
  sendSuccess(res, getUserAuth(req));
});
