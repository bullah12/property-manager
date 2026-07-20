import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { listMeta, ok, okList } from "@/lib/api/respond";
import { parseSort } from "@/lib/api/sort";
import { paginationQuery, parseBody, parseQuery } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { CONTRACTOR_TRADE_VALUES } from "@/lib/contractors";
import { prisma, requireWorkspaceId } from "@/lib/db";
import { createContractorSchema } from "@/lib/schemas/contractor";
import { serializeContractor } from "@/lib/serializers";

const listQuery = paginationQuery.extend({
  q: z.string().trim().max(200).optional(),
  trade: z.enum(CONTRACTOR_TRADE_VALUES).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  sort: z.string().optional(),
});

const SORT_FIELDS: Record<string, string> = {
  business_name: "businessName",
  trade: "trade",
  status: "status",
  created_at: "createdAt",
};

export const GET = apiHandler(async (req) => {
  await requireAdmin();
  const q = parseQuery(req, listQuery);
  const where: Prisma.ContractorWhereInput = {
    ...(q.trade ? { trade: q.trade } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.q
      ? {
          OR: [
            { businessName: { contains: q.q, mode: "insensitive" as const } },
            { contactName: { contains: q.q, mode: "insensitive" as const } },
            { email: { contains: q.q, mode: "insensitive" as const } },
            { phone: { contains: q.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const orderBy = parseSort(q.sort, SORT_FIELDS, { field: "businessName", dir: "asc" });

  const [total, rows] = await prisma.$transaction([
    prisma.contractor.count({ where }),
    prisma.contractor.findMany({
      where,
      orderBy,
      skip: (q.page - 1) * q.perPage,
      take: q.perPage,
    }),
  ]);

  const aggregates = rows.length
    ? await prisma.contractorReview.groupBy({
        by: ["contractorId"],
        where: { contractorId: { in: rows.map((row) => row.id) } },
        _avg: { rating: true },
        _count: { _all: true },
      })
    : [];
  const ratings = new Map(
    aggregates.map((item) => [
      item.contractorId,
      { averageRating: item._avg.rating, reviewCount: item._count._all },
    ])
  );

  return okList(
    rows.map((row) => ({
      ...serializeContractor(row),
      ...(ratings.get(row.id) ?? { averageRating: null, reviewCount: 0 }),
    })),
    listMeta(q.page, q.perPage, total)
  );
});

export const POST = apiHandler(async (req) => {
  await requireAdmin();
  const body = await parseBody(req, createContractorSchema);
  const contractor = await prisma.contractor.create({
    data: { ...body, workspaceId: requireWorkspaceId() },
  });
  return ok(serializeContractor(contractor), 201);
});
