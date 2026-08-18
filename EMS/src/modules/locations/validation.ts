import { z } from 'zod';
import { MAX_LOCATION_BATCH } from '../../config/constants';
import { dateStringSchema, objectIdSchema, paginationSchema } from '../../lib/validation';

const pointSchema = z.object({
  timestamp: dateStringSchema,
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  accuracy: z.number().nonnegative(),
  speed: z.number().nonnegative().optional(),
  heading: z.number().gte(0).lte(360).optional(),
  battery: z.number().gte(0).lte(100).optional(),
  mockLocation: z.boolean().default(false),
});

export const ingestLocationSchema = z.object({
  deviceId: z.string().min(3).optional(),
  employeeId: objectIdSchema.optional(),
  points: z.array(pointSchema).min(1).max(MAX_LOCATION_BATCH),
});

export const employeeRouteQuerySchema = paginationSchema.extend({
  start: dateStringSchema,
  end: dateStringSchema,
});

export const employeeParamsSchema = z.object({ employeeId: objectIdSchema });
