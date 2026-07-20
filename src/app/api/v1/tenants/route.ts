import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { ok, okList, listMeta } from "@/lib/api/respond";
import { parseSort } from "@/lib/api/sort";
import { paginationQuery, parseBody, parseQuery } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma, requireWorkspaceId } from "@/lib/db";
import { createTenantSchema } from "@/lib/schemas/tenancy";
import { serializeTenant } from "@/lib/serializers";

const listQuery = paginationQuery.extend({
  q: z.string().trim().max(200).optional(),
  sort: z.string().optional(),
});

const SORT_FIELDS: Record<string, string> = {
  created_at: "createdAt",
  full_name: "fullName",
};

export const GET = apiHandler(async (req) => {
  await requireAdmin();
  const q = parseQuery(req, listQuery);
  const where: Prisma.TenantWhereInput = q.q
    ? {
        OR: [
          { fullName: { contains: q.q, mode: "insensitive" } },
          { email: { contains: q.q, mode: "insensitive" } },
        ],
      }
    : {};
  const orderBy = parseSort(q.sort, SORT_FIELDS, { field: "fullName", dir: "asc" });

  const [total, rows] = await prisma.$transaction([
    prisma.tenant.count({ where }),
    prisma.tenant.findMany({
      where,
      orderBy,
      skip: (q.page - 1) * q.perPage,
      take: q.perPage,
      include: {
        tenancies: {
          select: { status: true, property: { select: { nickname: true } } },
        },
      },
    }),
  ]);

  const data = rows.map((t) => ({
    ...serializeTenant(t),
    tenancyCount: t.tenancies.length,
    currentProperties: t.tenancies
      .filter((x) => x.status === "active")
      .map((x) => x.property.nickname),
  }));

  return okList(data, listMeta(q.page, q.perPage, total));
});

export const POST = apiHandler(async (req) => {
  await requireAdmin();
  const body = await parseBody(req, createTenantSchema);
  const tenant = await prisma.tenant.create({
    data: { ...body, workspaceId: requireWorkspaceId() },
  });
  return ok(serializeTenant(tenant), 201);
});
