import { z } from "zod";
import { conflict, notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { kickJobRunner } from "@/lib/jobs";
import { serializeJob } from "@/lib/serializers";

const paramsSchema = z.object({ id: z.uuid() });

/** Re-queue a dead job (PLAN.md §6). */
export const POST = apiHandler<{ id: string }>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) throw notFound("Job");
  if (job.status !== "dead" && job.status !== "failed") {
    throw conflict(`Only a dead/failed job can be retried (status: ${job.status})`);
  }
  const updated = await prisma.job.update({
    where: { id },
    data: { status: "pending", attempts: 0, runAt: new Date(), lastError: null },
  });
  kickJobRunner();
  return ok(serializeJob(updated));
});
