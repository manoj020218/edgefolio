import { AppError, assertFound } from '../../lib/errors';
import { Company } from './model';

export async function createCompany(input: {
  name: string;
  code: string;
  status: 'active' | 'disabled';
  timezone: string;
}) {
  const exists = await Company.exists({ code: input.code.toUpperCase() });
  if (exists) throw new AppError(409, 'COMPANY_CODE_EXISTS', 'Company code already exists');
  return Company.create({ ...input, code: input.code.toUpperCase() });
}

export async function listCompanies(companyId?: string) {
  if (companyId) return Company.findById(companyId).lean();
  return Company.find().sort({ createdAt: -1 }).lean();
}

export async function updateCompany(id: string, updates: Record<string, unknown>) {
  const company = await Company.findByIdAndUpdate(id, updates, { new: true });
  return assertFound(company, 'COMPANY_NOT_FOUND', 'Company not found');
}
