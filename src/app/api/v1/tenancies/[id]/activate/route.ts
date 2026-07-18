import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { serializeTenancy } from "@/lib/serializers";
import { activateTenancy } from "@/lib/tenancies";

const paramsSchema = z.object({ id: z.uuid() });

export const POST = apiHandler<{ id: string }>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const tenancy = await activateTenancy(id);
  return ok(serializeTenancy(tenancy));
});
