import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { ApiError, type ErrorDetail } from "./errors";

function toDetails(err: ZodError): ErrorDetail[] {
  return err.issues.map((i) => ({
    field: i.path.join(".") || "(root)",
    issue: i.message,
  }));
}

/** Parse an unknown value against a schema; ZodError → 400 VALIDATION_ERROR envelope. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError("VALIDATION_ERROR", "Request validation failed", toDetails(result.error));
  }
  return result.data;
}

/** Read and validate a JSON request body. */
export async function parseBody<S extends z.ZodType>(
  req: NextRequest,
  schema: S
): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON", [
      { field: "(body)", issue: "invalid JSON" },
    ]);
  }
  return parse(schema, body);
}

/** Validate query-string params (flat object of first values). */
export function parseQuery<S extends z.ZodType>(req: NextRequest, schema: S): z.output<S> {
  const raw: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    if (!(k in raw)) raw[k] = v;
  });
  return parse(schema, raw);
}

/** Shared pagination query schema: ?page=&perPage= (max 100). */
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});
