import { z } from "zod";
import { conflict, notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializeProperty } from "@/lib/serializers";
import { ownershipInclude } from "@/lib/property-ownership";

const paramsSchema = z.object({ id: z.uuid() });

/** Transition active → archived (PLAN.md §6). */
export const POST = apiHandler<{ id: string }>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) throw notFound("Property");
  if (property.status !== "active") {
    throw conflict("Only an active property can be archived");
  }
  const updated = await prisma.property.update({
    where: { id },
    data: { status: "archived" },
    include: ownershipInclude,
  });
  return ok(serializeProperty(updated));
});
