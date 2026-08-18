import { z } from 'zod';
import { ROLES, USER_STATUSES } from '../../config/constants';
import { objectIdSchema, phoneSchema } from '../../lib/validation';

export const createUserSchema = z.object({
  companyId: objectIdSchema.optional(),
  name: z.string().min(2),
  mobile: phoneSchema.optional(),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(ROLES),
  managerId: objectIdSchema.optional(),
  status: z.enum(USER_STATUSES).default('active'),
});

export const updateUserSchema = createUserSchema.omit({ password: true }).partial();
export const userParamsSchema = z.object({ id: objectIdSchema });
