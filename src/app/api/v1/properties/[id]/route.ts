import { z } from "zod";
import { notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse, parseBody } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { patchPropertySchema } from "@/lib/schemas/property";
import { serializeProperty } from "@/lib/serializers";

const paramsSchema = z.object({ id: z.uuid() });

export const GET = apiHandler<{ id: string }>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) throw notFound("Property");

  // Header mini-stats (PLAN.md §4 wireframe 1). Remaining pieces land with
  // their tables: next deadline (Phase 7), YTD expenses (Phase 5).
  const activeTenancy = await prisma.tenancy.findFirst({
    where: { propertyId: id, status: "active" },
  });
  const stats = {
    currentRentCents: activeTenancy?.rentAmountCents ?? null,
    nextDeadline: null as string | null,
    ytdExpensesCents: 0,
  };

  return ok({ ...serializeProperty(property), stats });
});

export const PATCH = apiHandler<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const body = await parseBody(req, patchPropertySchema);
  const existing = await prisma.property.findUnique({ where: { id } });
  if (!existing) throw notFound("Property");
  const property = await prisma.property.update({ where: { id }, data: body });
  return ok(serializeProperty(property));
});
