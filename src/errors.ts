export class AppError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message); this.status = status; this.code = code;
  }
}
export function requireValue(condition: unknown, status: number, code: string, message: string): asserts condition {
  if (!condition) throw new AppError(status, code, message);
}
export function text(value: unknown, name: string, max = 500): string {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= max, 400, 'INVALID_INPUT', `${name} is required (maximum ${max} characters)`);
  return value;
}
export function object(value: unknown): Record<string, unknown> {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 400, 'INVALID_INPUT', 'Expected an object');
  return value as Record<string, unknown>;
}
