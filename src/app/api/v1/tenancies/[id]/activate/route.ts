import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { assertSignedContract } from "@/lib/contracts";
import { serializeTenancy } from "@/lib/serializers";
import { activateTenancy } from "@/lib/tenancies";

const paramsSchema = z.object({ id: z.uuid() });

const bodySchema = z.object({ override: z.boolean().default(false) });

/**
 * draft → active. Requires a signed contract on the tenancy, or an explicit
 * `{ "override": true }` body (PLAN.md §7 Phase 4 activation rule).
 */
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
  const { override } = parse(bodySchema, parsed);
  const tenancy = await activateTenancy(
    id,
    override ? undefined : assertSignedContract
  );
  return ok(serializeTenancy(tenancy));
});
