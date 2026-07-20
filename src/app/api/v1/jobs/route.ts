import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { okList, listMeta } from "@/lib/api/respond";
import { paginationQuery, parseQuery } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildContractGenerationJobContext } from "@/lib/job-context";
import { serializeJob } from "@/lib/serializers";

const listQuery = paginationQuery.extend({
  status: z
    .enum(["pending", "running", "succeeded", "failed", "dead", "cancelled"])
    .optional(),
});

/** Actionable queue visibility, including contract-generation prerequisites. */
export const GET = apiHandler(async (req) => {
  await requireAdmin();
  const q = parseQuery(req, listQuery);
  const where: Prisma.JobWhereInput = q.status ? { status: q.status } : {};
  const [total, rows] = await prisma.$transaction([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (q.page - 1) * q.perPage,
      take: q.perPage,
    }),
  ]);

  const contractPayloads = rows.flatMap((job) => {
    if (job.type !== "contract.generate") return [];
    const payload = job.payload as { tenancyId?: unknown; kind?: unknown };
    return typeof payload.tenancyId === "string"
      ? [{ jobId: job.id, tenancyId: payload.tenancyId, kind: payload.kind }]
      : [];
  });
  const tenancies = contractPayloads.length
    ? await prisma.tenancy.findMany({
        where: { id: { in: [...new Set(contractPayloads.map((p) => p.tenancyId))] } },
        include: {
          property: {
            include: {
              ownerships: { where: { isMainLandlord: true }, include: { owner: true } },
            },
          },
          tenant: true,
        },
      })
    : [];
  const tenancyById = new Map(tenancies.map((tenancy) => [tenancy.id, tenancy]));
  const contractPayloadByJobId = new Map(
    contractPayloads.map((payload) => [payload.jobId, payload])
  );

  const jobs = rows.map((job) => {
    const payload = contractPayloadByJobId.get(job.id);
    const contractKind = payload?.kind === "renewal" ? "renewal" : "lease";
    const context = payload
      ? buildContractGenerationJobContext(
          payload.tenancyId,
          contractKind,
          tenancyById.get(payload.tenancyId),
          job.lastError
        )
      : null;
    return { ...serializeJob(job), context };
  });

  return okList(jobs, listMeta(q.page, q.perPage, total));
});
