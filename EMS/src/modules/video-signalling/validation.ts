import { z } from 'zod';
import { objectIdSchema } from '../../lib/validation';

export const createSessionSchema = z.object({
  calleeUserId: objectIdSchema,
  sessionId: z.string().min(2),
});

export const sessionParamsSchema = z.object({ id: objectIdSchema });
