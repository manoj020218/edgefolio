import { assertFound } from '../../lib/errors';
import { Visit } from './model';

export async function checkInVisit(scope: { companyId: string; employeeId: string }, input: Record<string, unknown>) {
  return Visit.create({ companyId: scope.companyId, employeeId: scope.employeeId, ...input, status: 'open' });
}

export async function checkOutVisit(companyId: string, id: string, input: { checkOutAt: string; notes?: string }) {
  const visit = await Visit.findOneAndUpdate({ _id: id, companyId }, { checkOutAt: new Date(input.checkOutAt), notes: input.notes, status: 'closed' }, { new: true });
  return assertFound(visit, 'VISIT_NOT_FOUND', 'Visit not found');
}

export async function listVisits(companyId: string, employeeId?: string, start?: string, end?: string, limit = 20, page = 1) {
  const filter: Record<string, unknown> = { companyId, ...(employeeId ? { employeeId } : {}) };
  if (start || end) filter.checkInAt = { ...(start ? { $gte: new Date(start) } : {}), ...(end ? { $lte: new Date(end) } : {}) };
  return Visit.find(filter).sort({ checkInAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
}
