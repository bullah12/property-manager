import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ApiError } from "./errors";
import { errorResponse } from "./respond";

export interface HandlerCtx<P> {
  params: P;
  requestId: string;
}

type RouteFn<P> = (req: NextRequest, ctx: HandlerCtx<P>) => Promise<NextResponse>;

/**
 * Wraps a route handler with the shared API conventions (PLAN.md §6):
 * X-Request-Id on every response and ApiError/unknown-error mapping to the
 * error envelope with stable codes.
 */
export function apiHandler<P = Record<string, never>>(fn: RouteFn<P>) {
  return async (
    req: NextRequest,
    ctx: { params: Promise<P> }
  ): Promise<NextResponse> => {
    const requestId = randomUUID();
    let res: NextResponse;
    try {
      const params = ctx.params ? await ctx.params : ({} as P);
      res = await fn(req, { params, requestId });
    } catch (err) {
      if (err instanceof ApiError) {
        res = errorResponse(err.code, err.message, err.details);
      } else {
        console.error(`[${requestId}] Unhandled API error:`, err);
        res = errorResponse("INTERNAL", "Internal server error");
      }
    }
    res.headers.set("X-Request-Id", requestId);
    return res;
  };
}
