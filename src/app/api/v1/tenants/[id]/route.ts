import { z } from "zod";
import { notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse, parseBody } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { patchTenantSchema } from "@/lib/schemas/tenancy";
import { serializeTenancy, serializeTenant } from "@/lib/serializers";

const paramsSchema = z.object({ id: z.uuid() });

/** Tenant detail + cross-property tenancy history (PLAN.md §4). */
export const GET = apiHandler<{ id: string }>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      tenancies: {
        include: { property: true },
        orderBy: { startDate: "desc" },
      },
    },
  });
  if (!tenant) throw notFound("Tenant");
  const { tenancies, ...bare } = tenant;
  return ok({
    ...serializeTenant(bare as typeof tenant),
    tenancies: tenancies.map(serializeTenancy),
  });
});

export const PATCH = apiHandler<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const body = await parseBody(req, patchTenantSchema);
  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) throw notFound("Tenant");
  const tenant = await prisma.tenant.update({ where: { id }, data: body });
  return ok(serializeTenant(tenant));
});
