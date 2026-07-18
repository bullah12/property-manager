import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { requireCronSecret } from "@/lib/cron";
import { runJobs } from "@/lib/jobs";

/** Jobs-runner sweep (PLAN.md §6). */
export const POST = apiHandler(async (req) => {
  requireCronSecret(req);
  const result = await runJobs(50);
  return ok(result);
});

// Vercel Cron sends GET requests (with the CRON_SECRET as a Bearer token).
export const GET = POST;
