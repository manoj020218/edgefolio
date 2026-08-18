import { Recording } from './model';
import { storageProvider } from './storage';

export async function createRecording(scope: { companyId: string; employeeId: string }, input: Record<string, unknown>) {
  await storageProvider.describe(String(input.storageKey));
  return Recording.create({ companyId: scope.companyId, employeeId: scope.employeeId, ...input });
}

export async function listRecordings(companyId: string, employeeId?: string, limit = 20, page = 1) {
  return Recording.find({ companyId, ...(employeeId ? { employeeId } : {}) }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
}
