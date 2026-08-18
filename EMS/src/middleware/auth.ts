import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';
import { type Role, verifyAccessToken, verifyDeviceToken } from '../lib/jwt';

function readBearer(req: Request) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) throw new AppError(401, 'AUTH_REQUIRED', 'Missing access token');
  return header.slice(7);
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = readBearer(req);
  try {
    req.auth = verifyAccessToken(token);
    return next();
  } catch {
    try {
      req.auth = verifyDeviceToken(token);
      return next();
    } catch {
      return next(new AppError(401, 'AUTH_INVALID', 'Invalid or expired token'));
    }
  }
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (req.auth?.kind !== 'user') return next(new AppError(403, 'USER_ONLY', 'User session required'));
  return next();
}

export function requireDeviceOrUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(new AppError(401, 'AUTH_REQUIRED', 'Authentication required'));
  return next();
}

export function requireRoles(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.auth?.kind !== 'user') return next(new AppError(403, 'USER_ONLY', 'User session required'));
    if (!roles.includes(req.auth.role)) {
      return next(new AppError(403, 'ROLE_FORBIDDEN', 'Insufficient permissions'));
    }
    return next();
  };
}
