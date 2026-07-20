import { z } from "zod";
import { notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse, parseBody } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { patchPropertySchema } from "@/lib/schemas/property";
import { serializeProperty } from "@/lib/serializers";
import { ownershipInclude } from "@/lib/property-ownership";

const paramsSchema = z.object({ id: z.uuid() });

export const GET = apiHandler<{ id: string }>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  // Header mini-stats (PLAN.md §4 wireframe 1).
  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  const [property, activeTenancy, ytd, nextItem] = await Promise.all([
    prisma.property.findUnique({ where: { id }, include: ownershipInclude }),
    prisma.tenancy.findFirst({ where: { propertyId: id, status: "active" } }),
    prisma.transaction.aggregate({
      _sum: { amountCents: true },
      where: { propertyId: id, direction: "expense", occurredOn: { gte: yearStart } },
    }),
    prisma.complianceItem.findFirst({
      where: { propertyId: id, completedOn: null },
      orderBy: { dueOn: "asc" },
    }),
  ]);
  if (!property) throw notFound("Property");
  const stats = {
    currentRentCents: activeTenancy?.rentAmountCents ?? null,
    nextDeadline: nextItem ? nextItem.dueOn.toISOString().slice(0, 10) : null,
    ytdExpensesCents: ytd._sum.amountCents ?? 0,
  };

  return ok({ ...serializeProperty(property), stats });
});

export const PATCH = apiHandler<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const body = await parseBody(req, patchPropertySchema);
  const existing = await prisma.property.findUnique({ where: { id } });
  if (!existing) throw notFound("Property");
  const property = await prisma.$transaction(async (tx) => {
    await tx.property.update({ where: { id }, data: body });
    return tx.property.findUniqueOrThrow({ where: { id }, include: ownershipInclude });
  });
  return ok(serializeProperty(property));
});
