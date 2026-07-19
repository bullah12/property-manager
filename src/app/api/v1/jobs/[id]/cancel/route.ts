import { z } from "zod";
import { conflict, notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializeJob } from "@/lib/serializers";

const paramsSchema = z.object({ id: z.uuid() });

/** Cancel queued/retrying work before the runner claims it. */
export const POST = apiHandler<{ id: string }>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);

  // The status predicate makes cancellation atomic with the runner's claim.
  const result = await prisma.job.updateMany({
    where: { id, status: "pending" },
    data: { status: "cancelled" },
  });
  if (result.count === 0) {
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) throw notFound("Job");
    throw conflict(`Only a pending job can be cancelled (status: ${job.status})`);
  }

  const cancelled = await prisma.job.findUnique({ where: { id } });
  if (!cancelled) throw notFound("Job");
  return ok(serializeJob(cancelled));
});
