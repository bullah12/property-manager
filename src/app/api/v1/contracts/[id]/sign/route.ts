import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse, parseBody } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { signContract } from "@/lib/contracts";
import { parseDateOnly } from "@/lib/dates";
import { dateOnly } from "@/lib/schemas/tenancy";
import { serializeContract } from "@/lib/serializers";

const paramsSchema = z.object({ id: z.uuid() });

const signSchema = z.object({
  signedOn: dateOnly,
  fileId: z.uuid().optional(), // optional signed-copy upload replacing the file
});

export const POST = apiHandler<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const body = await parseBody(req, signSchema);
  const contract = await signContract(id, parseDateOnly(body.signedOn), body.fileId);
  return ok(serializeContract(contract));
});
