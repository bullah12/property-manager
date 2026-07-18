import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { okList, listMeta } from "@/lib/api/respond";
import { paginationQuery, parseQuery } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializeJob } from "@/lib/serializers";

const listQuery = paginationQuery.extend({
  status: z.enum(["pending", "running", "succeeded", "failed", "dead"]).optional(),
});

/** Dead-letter visibility (PLAN.md §6). */
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
  return okList(rows.map(serializeJob), listMeta(q.page, q.perPage, total));
});
