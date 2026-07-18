import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse, parseBody } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { completeComplianceItem } from "@/lib/compliance";
import { parseDateOnly } from "@/lib/dates";
import { dateOnly } from "@/lib/schemas/tenancy";
import { serializeComplianceItem } from "@/lib/serializers";

const paramsSchema = z.object({ id: z.uuid() });

const bodySchema = z.object({
  completedOn: dateOnly,
  fileId: z.uuid().optional(),
});

/** §5.2 rollover: recurring items roll due_on forward from completedOn. */
export const POST = apiHandler<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const body = await parseBody(req, bodySchema);
  const item = await completeComplianceItem(id, parseDateOnly(body.completedOn), body.fileId);
  return ok(serializeComplianceItem(item));
});
