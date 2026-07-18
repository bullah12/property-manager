import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parseQuery } from "@/lib/api/validate";
import { requireCronSecret, testClockAllowed } from "@/lib/cron";
import { DATE_ONLY_RE, todayInTimezone, toDateOnly } from "@/lib/dates";
import { runJobs } from "@/lib/jobs";
import { getOwner } from "@/lib/notify";
import { runDailyScan } from "@/lib/scan";

const querySchema = z.object({
  today: z.string().regex(DATE_ONLY_RE).optional(),
});

/** The 08:00 daily scan (§5.2 leads + §5.1 rent-overdue pass). */
export const POST = apiHandler(async (req) => {
  requireCronSecret(req);
  const q = parseQuery(req, querySchema);
  const owner = await getOwner();
  const today =
    q.today && testClockAllowed() ? q.today : toDateOnly(todayInTimezone(owner.timezone));
  const result = await runDailyScan(today);
  // Sweep the queue immediately so enqueued emails go out this invocation.
  const jobs = await runJobs(25);
  return ok({ ...result, jobsRan: jobs.ran });
});

// Vercel Cron sends GET requests (with the CRON_SECRET as a Bearer token).
export const GET = POST;
