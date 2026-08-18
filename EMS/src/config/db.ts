import mongoose from 'mongoose';
import { env } from './env';
import { ensureSuperAdmin } from '../modules/auth/service';

export async function connectDatabase() {
  await mongoose.connect(env.MONGODB_URI);
  await ensureSuperAdmin();
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
