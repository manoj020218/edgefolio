import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ROLES } from '../config/constants';

export type Role = (typeof ROLES)[number];

export type AuthContext =
  | { kind: 'user'; userId: string; companyId?: string; employeeId?: string; role: Role }
  | { kind: 'device'; deviceId: string; companyId: string; employeeId?: string };

const accessExpiry = env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'];
const refreshExpiry = `${env.REFRESH_TOKEN_TTL_DAYS}d` as jwt.SignOptions['expiresIn'];
const deviceExpiry = `${env.DEVICE_TOKEN_TTL_DAYS}d` as jwt.SignOptions['expiresIn'];

export function signAccessToken(payload: Omit<Extract<AuthContext, { kind: 'user' }>, 'kind'>) {
  return jwt.sign({ kind: 'user', ...payload }, env.JWT_ACCESS_SECRET, {
    expiresIn: accessExpiry,
  });
}

export function signRefreshToken(payload: Omit<Extract<AuthContext, { kind: 'user' }>, 'kind'>) {
  return jwt.sign({ kind: 'user', ...payload }, env.JWT_REFRESH_SECRET, {
    expiresIn: refreshExpiry,
  });
}

export function signDeviceToken(payload: Omit<Extract<AuthContext, { kind: 'device' }>, 'kind'>) {
  return jwt.sign({ kind: 'device', ...payload }, env.JWT_DEVICE_SECRET, {
    expiresIn: deviceExpiry,
  });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthContext;
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as AuthContext;
}

export function verifyDeviceToken(token: string) {
  return jwt.verify(token, env.JWT_DEVICE_SECRET) as AuthContext;
}
