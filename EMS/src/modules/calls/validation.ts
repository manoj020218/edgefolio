import { z } from 'zod';
import { CALL_DIRECTIONS, CALL_STATUSES } from '../../config/constants';
import { dateStringSchema, objectIdSchema, paginationSchema, phoneSchema } from '../../lib/validation';

const locationSchema = z.object({
  latitude: z.number().gte(-90).lte(90).optional(),
  longitude: z.number().gte(-180).lte(180).optional(),
  accuracy: z.number().nonnegative().optional(),
}).optional();

export const ingestCallSchema = z.object({
  employeeId: objectIdSchema.optional(),
  deviceId: z.string().min(3).optional(),
  externalCallId: z.string().min(2),
  phoneNumber: phoneSchema,
  direction: z.enum(CALL_DIRECTIONS),
  status: z.enum(CALL_STATUSES),
  startedAt: dateStringSchema,
  answeredAt: dateStringSchema.optional(),
  endedAt: dateStringSchema.optional(),
  durationSeconds: z.number().int().nonnegative().default(0),
  contactName: z.string().optional(),
  location: locationSchema,
  recordingId: z.string().optional(),
});

export const callQuerySchema = paginationSchema.extend({
  employeeId: objectIdSchema.optional(),
  start: dateStringSchema.optional(),
  end: dateStringSchema.optional(),
});
