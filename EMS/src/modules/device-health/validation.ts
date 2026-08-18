import { z } from 'zod';
import { dateStringSchema } from '../../lib/validation';

export const heartbeatSchema = z.object({
  deviceId: z.string().min(3).optional(),
  timestamp: dateStringSchema,
  batteryPercent: z.number().gte(0).lte(100).optional(),
  charging: z.boolean().optional(),
  gpsEnabled: z.boolean().optional(),
  networkType: z.string().optional(),
  internetAvailable: z.boolean().optional(),
  appVersion: z.string().optional(),
  androidVersion: z.string().optional(),
  trackingServiceRunning: z.boolean().optional(),
  lastLocationAt: dateStringSchema.optional(),
});
