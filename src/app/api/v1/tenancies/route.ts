import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok, okList, listMeta } from "@/lib/api/respond";
import { paginationQuery, parseBody, parseQuery } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseDateOnly } from "@/lib/dates";
import { syncTenancyReminder } from "@/lib/reminders";
import { createTenancySchema } from "@/lib/schemas/tenancy";
import { serializeTenancy } from "@/lib/serializers";

const listQuery = paginationQuery.extend({
  propertyId: z.uuid().optional(),
  tenantId: z.uuid().optional(),
  status: z.enum(["draft", "active", "ended", "renewed"]).optional(),
});

export const GET = apiHandler(async (req) => {
  await requireAdmin();
  const q = parseQuery(req, listQuery);
  const where: Prisma.TenancyWhereInput = {
    ...(q.propertyId ? { propertyId: q.propertyId } : {}),
    ...(q.tenantId ? { tenantId: q.tenantId } : {}),
    ...(q.status ? { status: q.status } : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.tenancy.count({ where }),
    prisma.tenancy.findMany({
      where,
      orderBy: { startDate: "desc" },
      skip: (q.page - 1) * q.perPage,
      take: q.perPage,
      include: { tenant: true, property: true },
    }),
  ]);
  return okList(rows.map(serializeTenancy), listMeta(q.page, q.perPage, total));
});

/** Create a rolling assured-periodic tenancy as a draft (PLAN.md §6). */
export const POST = apiHandler(async (req) => {
  await requireAdmin();
  const body = await parseBody(req, createTenancySchema);

  const [property, tenant] = await Promise.all([
    prisma.property.findUnique({ where: { id: body.propertyId } }),
    prisma.tenant.findUnique({ where: { id: body.tenantId } }),
  ]);
  if (!property) throw notFound("Property");
  if (!tenant) throw notFound("Tenant");

  const tenancy = await prisma.$transaction(async (tx) => {
    const created = await tx.tenancy.create({
      data: {
        ...body,
        startDate: parseDateOnly(body.startDate),
        endDate: body.endDate ? parseDateOnly(body.endDate) : null,
        status: "draft",
      },
      include: { tenant: true, property: true },
    });
    // The reminder hook removes any legacy lease-expiry reminder because APTs roll.
    await syncTenancyReminder(tx, created);
    return created;
  });
  return ok(serializeTenancy(tenancy), 201);
});
