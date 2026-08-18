import { z } from 'zod';
import { COMPANY_STATUSES } from '../../config/constants';
import { objectIdSchema } from '../../lib/validation';

export const createCompanySchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).max(20),
  status: z.enum(COMPANY_STATUSES).default('active'),
  timezone: z.string().min(2),
});

export const updateCompanySchema = createCompanySchema.partial();
export const companyParamsSchema = z.object({ id: objectIdSchema });
