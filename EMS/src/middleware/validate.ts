import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';

export function validate(schema: ZodTypeAny, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as Record<string, unknown>)[source] = schema.parse(
      (req as unknown as Record<string, unknown>)[source],
    );
    next();
  };
}
