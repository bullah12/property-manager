import type { NextRequest } from "next/server";
import { unauthenticated } from "@/lib/api/errors";

/** Guard for the internal cron routes (PLAN.md §6): CRON_SECRET header. */
export function requireCronSecret(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || header !== secret) {
    throw unauthenticated("Invalid cron secret");
  }
}

/** Test clock allowed outside production, or with an explicit local opt-in. */
export function testClockAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_TEST_CLOCK === "1";
}
