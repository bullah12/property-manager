import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse, parseBody } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordTransfer } from "@/lib/property-ownership";
import { transferOwnershipSchema } from "@/lib/schemas/ownership";
import { serializeOwnershipEvent } from "@/lib/serializers";

const paramsSchema = z.object({ id: z.uuid() });

export const POST = apiHandler<{ id: string }>(async (req, { params }) => {
  const { user } = await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const body = await parseBody(req, transferOwnershipSchema);
  const event = await prisma.$transaction(
    (tx) => recordTransfer(tx, id, body, user.id),
    { isolationLevel: "Serializable" }
  );
  return ok(serializeOwnershipEvent(event), 201);
});
