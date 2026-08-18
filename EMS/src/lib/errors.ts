export class AppError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function assertFound<T>(value: T | null, code: string, message: string) {
  if (!value) throw new AppError(404, code, message);
  return value;
}
