import { z } from 'zod';
import { objectIdSchema, paginationSchema } from '../../lib/validation';

export const createRecordingSchema = z.object({
  employeeId: objectIdSchema.optional(),
  recordingId: z.string().min(2),
  callId: objectIdSchema.optional(),
  storageKey: z.string().min(2),
  mimeType: z.string().min(3),
  size: z.number().int().positive(),
  duration: z.number().nonnegative(),
});

export const recordingQuerySchema = paginationSchema.extend({
  employeeId: objectIdSchema.optional(),
});
