import { z } from "zod";
import { conflict } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse, parseBody } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseDateOnly, toDateOnly } from "@/lib/dates";
import { patchTenancySchema } from "@/lib/schemas/tenancy";
import { serializeTenancy } from "@/lib/serializers";
import { getTenancyOr404 } from "@/lib/tenancies";

const paramsSchema = z.object({ id: z.uuid() });

export const GET = apiHandler<{ id: string }>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const tenancy = await getTenancyOr404(id);
  return ok(serializeTenancy(tenancy));
});

/** Edit while 'draft' only (409 otherwise) — PLAN.md §6. */
export const PATCH = apiHandler<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const body = await parseBody(req, patchTenancySchema);
  const existing = await getTenancyOr404(id);
  if (existing.status !== "draft") {
    throw conflict("Only a draft tenancy can be edited");
  }

  const startDate = body.startDate ? parseDateOnly(body.startDate) : existing.startDate;
  const endDate = body.endDate ? parseDateOnly(body.endDate) : existing.endDate;
  if (toDateOnly(endDate) <= toDateOnly(startDate)) {
    throw conflict("endDate must be after startDate");
  }

  const tenancy = await prisma.tenancy.update({
    where: { id },
    data: { ...body, startDate, endDate },
    include: { tenant: true, property: true },
  });
  return ok(serializeTenancy(tenancy));
});
