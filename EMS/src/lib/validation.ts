import { z, type ZodTypeAny } from 'zod';

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid MongoDB id');
export const dateStringSchema = z.string().datetime({ offset: true });
export const phoneSchema = z.string().min(7).max(20);
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export function parseSchema<T extends ZodTypeAny>(schema: T, input: unknown) {
  return schema.parse(input);
}
