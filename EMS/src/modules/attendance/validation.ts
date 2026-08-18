import { z } from 'zod';
import { dateStringSchema, objectIdSchema, paginationSchema } from '../../lib/validation';

const locationSchema = z.object({
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  accuracy: z.number().nonnegative().optional(),
});

export const checkInSchema = z.object({
  employeeId: objectIdSchema.optional(),
  deviceId: z.string().min(3).optional(),
  timestamp: dateStringSchema,
  location: locationSchema,
  notes: z.string().max(500).optional(),
});

export const checkOutSchema = checkInSchema;
export const attendanceHistoryQuerySchema = paginationSchema.extend({
  employeeId: objectIdSchema.optional(),
  start: dateStringSchema.optional(),
  end: dateStringSchema.optional(),
});
