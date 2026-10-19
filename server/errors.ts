// Typed errors thrown by services. HTTP adapters map `status` to the response code.

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "DEADLINE_PASSED"
  | "RATE_LIMITED";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  DEADLINE_PASSED: 409,
  RATE_LIMITED: 429,
};

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.status = STATUS[code];
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
