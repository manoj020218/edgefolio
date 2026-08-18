import { addDays } from '../users/service';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { hashPassword, hashToken, verifyPassword } from '../../lib/crypto';
import { signAccessToken, signRefreshToken } from '../../lib/jwt';
import { Employee } from '../employees/model';
import { logAudit } from '../audit/service';
import { RefreshToken } from './model';
import { User } from '../users/model';

async function issueSession(userId: string) {
  const user = await User.findById(userId).lean();
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  const employee = await Employee.findOne({ userId: user._id }).select('_id').lean();
  const payload = {
    userId: String(user._id),
    companyId: user.companyId ? String(user.companyId) : undefined,
    employeeId: employee?._id ? String(employee._id) : undefined,
    role: user.role,
  } as const;
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  await RefreshToken.create({
    userId: user._id,
    companyId: user.companyId,
    tokenHash: hashToken(refreshToken),
    expiresAt: addDays(new Date(), env.REFRESH_TOKEN_TTL_DAYS),
  });
  return {
    accessToken,
    refreshToken,
    user: {
      id: String(user._id),
      companyId: user.companyId ? String(user.companyId) : undefined,
      role: user.role,
      name: user.name,
      email: user.email,
      employeeId: employee?._id ? String(employee._id) : undefined,
    },
  };
}

export async function ensureSuperAdmin() {
  if (!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASSWORD) return;
  const exists = await User.exists({ email: env.SUPER_ADMIN_EMAIL.toLowerCase() });
  if (exists) return;
  await User.create({
    name: 'System Super Admin',
    email: env.SUPER_ADMIN_EMAIL.toLowerCase(),
    passwordHash: await hashPassword(env.SUPER_ADMIN_PASSWORD),
    role: 'SUPER_ADMIN',
    status: 'active',
  });
}

export async function login(input: { email: string; password: string }) {
  const user = await User.findOne({ email: input.email.toLowerCase() });
  if (!user) throw new AppError(401, 'AUTH_INVALID', 'Invalid email or password');
  if (user.status !== 'active') throw new AppError(403, 'USER_DISABLED', 'User account is disabled');
  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) throw new AppError(401, 'AUTH_INVALID', 'Invalid email or password');
  const session = await issueSession(String(user._id));
  await logAudit({
    companyId: user.companyId ? String(user.companyId) : undefined,
    actorUserId: String(user._id),
    action: 'login',
    entityType: 'user',
    entityId: String(user._id),
  });
  return session;
}

export async function refresh(refreshToken: string) {
  const { verifyRefreshToken } = await import('../../lib/jwt');
  const payload = verifyRefreshToken(refreshToken);
  if (payload.kind !== 'user') throw new AppError(401, 'AUTH_INVALID', 'Invalid refresh token');
  const token = await RefreshToken.findOne({ tokenHash: hashToken(refreshToken), revokedAt: null });
  if (!token || token.expiresAt < new Date()) {
    throw new AppError(401, 'AUTH_INVALID', 'Refresh token expired or revoked');
  }
  return issueSession(String(payload.userId));
}

export async function logout(refreshToken: string) {
  await RefreshToken.findOneAndUpdate(
    { tokenHash: hashToken(refreshToken), revokedAt: null },
    { revokedAt: new Date() },
  );
  return { loggedOut: true };
}
