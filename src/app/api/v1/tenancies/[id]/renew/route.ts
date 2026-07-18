import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { renewTenancySchema } from "@/lib/schemas/tenancy";
import { serializeTenancy } from "@/lib/serializers";
import { renewTenancy } from "@/lib/tenancies";

const paramsSchema = z.object({ id: z.uuid() });

export const POST = apiHandler<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const raw = await req.text();
  let parsed: unknown = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON");
    }
  }
  const body = parse(renewTenancySchema, parsed);
  const successor = await renewTenancy(id, body);
  return ok(serializeTenancy(successor), 201);
});
