import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse, parseBody } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { reverseOwnershipEvent } from "@/lib/property-ownership";
import { reverseOwnershipEventSchema } from "@/lib/schemas/ownership";
import { serializeOwnershipEvent } from "@/lib/serializers";

const paramsSchema = z.object({ id: z.uuid(), eventId: z.uuid() });

export const POST = apiHandler<{ id: string; eventId: string }>(async (req, { params }) => {
  const { user } = await requireAdmin();
  const { id, eventId } = parse(paramsSchema, params);
  const body = await parseBody(req, reverseOwnershipEventSchema);
  const event = await prisma.$transaction(
    (tx) => reverseOwnershipEvent(tx, id, eventId, body.effectiveDate, body.reason, body.notes, user.id),
    { isolationLevel: "Serializable" }
  );
  return ok(serializeOwnershipEvent(event), 201);
});
