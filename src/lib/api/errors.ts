/** Stable error codes per PLAN.md §6 (rest-api-design skill, verbatim). */
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export interface ErrorDetail {
  field: string;
  issue: string;
}

/** Throw anywhere inside an apiHandler to produce the error envelope. */
export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: ErrorDetail[]
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound = (what = "Resource") =>
  new ApiError("NOT_FOUND", `${what} not found`);
export const conflict = (message: string) => new ApiError("CONFLICT", message);
export const unauthenticated = (message = "Authentication required") =>
  new ApiError("UNAUTHENTICATED", message);
export const forbidden = (message = "Not allowed") =>
  new ApiError("FORBIDDEN", message);
