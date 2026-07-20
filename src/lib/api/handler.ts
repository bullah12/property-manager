import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuth, runWithAuth } from "@/lib/auth";
import { runInWorkspace } from "@/lib/db";
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
      if (requiresWorkspaceContext(req.nextUrl.pathname)) {
        const authed = await requireAuth();
        res = await runWithAuth(authed, () =>
          runInWorkspace(authed.workspace.id, () => fn(req, { params, requestId }))
        );
      } else {
        res = await fn(req, { params, requestId });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        res = errorResponse(err.code, err.message, err.details);
      } else {
        console.error(`[${requestId}] Unhandled API error:`, err);
        res = errorResponse("INTERNAL", "Internal server error");
      }
    }
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("Cache-Control", "private, no-store, max-age=0");
    return res;
  };
}

/** Public/system endpoints establish their own security context. */
export function requiresWorkspaceContext(pathname: string): boolean {
  const publicRoutes = new Set([
    "/api/v1/auth/login",
    "/api/v1/auth/logout",
    "/api/v1/auth/signup",
    "/api/v1/health",
  ]);
  return (
    pathname.startsWith("/api/v1/") &&
    !publicRoutes.has(pathname)
  );
}
