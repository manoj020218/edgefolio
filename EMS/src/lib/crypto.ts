import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
