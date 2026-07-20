import { z } from "zod";
import { notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse, parseBody } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ownershipInclude, replacePropertyOwnerships } from "@/lib/property-ownership";
import { propertyOwnershipInputSchema } from "@/lib/schemas/property";
import { serializePropertyOwnership } from "@/lib/serializers";

const paramsSchema = z.object({ id: z.uuid() });

export const GET = apiHandler<{ id: string }>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const property = await prisma.property.findUnique({
    where: { id },
    include: ownershipInclude,
  });
  if (!property) throw notFound("Property");
  return ok(property.ownerships.map(serializePropertyOwnership));
});

/** Atomically replaces the allocation so totals and main landlord never drift. */
export const PUT = apiHandler<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const body = await parseBody(req, propertyOwnershipInputSchema);
  const existing = await prisma.property.findUnique({ where: { id } });
  if (!existing) throw notFound("Property");

  const ownerships = await prisma.$transaction(async (tx) => {
    await replacePropertyOwnerships(tx, id, body);
    return tx.propertyOwnership.findMany({
      where: { propertyId: id },
      include: { owner: true },
      orderBy: [{ isMainLandlord: "desc" }, { createdAt: "asc" }],
    });
  });
  return ok(ownerships.map(serializePropertyOwnership));
});
