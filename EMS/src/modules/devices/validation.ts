import { z } from 'zod';
import { DEVICE_STATUSES } from '../../config/constants';
import { objectIdSchema } from '../../lib/validation';

export const registerDeviceSchema = z.object({
  deviceId: z.string().min(3),
  employeeId: objectIdSchema.optional(),
  platform: z.string().min(2),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  androidVersion: z.string().optional(),
  appVersion: z.string().optional(),
  deviceName: z.string().optional(),
  fcmToken: z.string().optional(),
  managed: z.boolean().default(true),
});

export const assignDeviceSchema = z.object({ employeeId: objectIdSchema });
export const updateFcmTokenSchema = z.object({ fcmToken: z.string().min(10) });
export const updateDeviceSchema = z.object({ status: z.enum(DEVICE_STATUSES).optional(), managed: z.boolean().optional() });
export const deviceParamsSchema = z.object({ deviceId: z.string().min(3) });
