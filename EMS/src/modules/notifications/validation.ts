import { z } from 'zod';
import { COMMAND_TYPES } from '../../config/constants';
import { objectIdSchema } from '../../lib/validation';

export const createCommandSchema = z.object({
  targetUserId: objectIdSchema.optional(),
  targetDeviceId: z.string().min(3).optional(),
  commandType: z.enum(COMMAND_TYPES),
  payload: z.record(z.any()).default({}),
});

export const commandParamsSchema = z.object({ id: objectIdSchema });
