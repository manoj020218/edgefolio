import { z } from 'zod';
import { dateStringSchema, objectIdSchema, paginationSchema } from '../../lib/validation';

const locationSchema = z.object({
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  accuracy: z.number().nonnegative().optional(),
});

export const visitCheckInSchema = z.object({
  employeeId: objectIdSchema.optional(),
  customerName: z.string().min(2),
  customerId: z.string().optional(),
  checkInAt: dateStringSchema,
  location: locationSchema,
  notes: z.string().max(500).optional(),
});

export const visitCheckOutSchema = z.object({
  checkOutAt: dateStringSchema,
  notes: z.string().max(500).optional(),
});

export const visitQuerySchema = paginationSchema.extend({
  employeeId: objectIdSchema.optional(),
  start: dateStringSchema.optional(),
  end: dateStringSchema.optional(),
});

export const visitParamsSchema = z.object({ id: objectIdSchema });
