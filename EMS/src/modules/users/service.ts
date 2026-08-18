import { AppError, assertFound } from '../../lib/errors';
import { hashPassword } from '../../lib/crypto';
import { User } from './model';

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function createUser(input: {
  companyId?: string;
  name: string;
  mobile?: string;
  email: string;
  password: string;
  role: string;
  managerId?: string;
  status: 'active' | 'disabled';
}) {
  const exists = await User.exists({ email: input.email.toLowerCase() });
  if (exists) throw new AppError(409, 'USER_EXISTS', 'User email already exists');
  return User.create({
    ...input,
    email: input.email.toLowerCase(),
    passwordHash: await hashPassword(input.password),
  });
}

export async function listUsers(companyId?: string) {
  return User.find(companyId ? { companyId } : {}).select('-passwordHash').sort({ createdAt: -1 }).lean();
}

export async function updateUser(id: string, updates: Record<string, unknown>) {
  const payload = { ...updates } as Record<string, unknown>;
  delete payload.password;
  const user = await User.findByIdAndUpdate(id, payload, { new: true }).select('-passwordHash');
  return assertFound(user, 'USER_NOT_FOUND', 'User not found');
}
