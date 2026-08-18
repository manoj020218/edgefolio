import { z } from 'zod';
import { EMPLOYEE_STATUSES } from '../../config/constants';
import { dateStringSchema, objectIdSchema } from '../../lib/validation';

export const createEmployeeSchema = z.object({
  userId: objectIdSchema,
  companyId: objectIdSchema.optional(),
  employeeCode: z.string().min(2),
  designation: z.string().min(2),
  department: z.string().min(2),
  managerId: objectIdSchema.optional(),
  joiningDate: dateStringSchema,
  status: z.enum(EMPLOYEE_STATUSES).default('active'),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();
export const employeeParamsSchema = z.object({ id: objectIdSchema });
