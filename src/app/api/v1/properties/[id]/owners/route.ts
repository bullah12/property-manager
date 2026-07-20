import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse, parseBody, parseQuery } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toDateOnly } from "@/lib/dates";
import { ownershipOverview, recordAllocationEvent } from "@/lib/property-ownership";
import { allocationSchema } from "@/lib/schemas/ownership";
import { serializeOwnershipEvent, serializeOwnershipNote, serializeOwnershipPayment, serializePropertyOwnership } from "@/lib/serializers";

const paramsSchema = z.object({ id: z.uuid() });
const querySchema = z.object({ asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

export const GET = apiHandler<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const { asOf } = parseQuery(req, querySchema);
  const overview = await ownershipOverview(id, asOf);
  const ownerships = overview.position.allocations.map((row) =>
    serializePropertyOwnership(row, overview.position)
  );
  return ok({
    asOf: asOf ?? toDateOnly(overview.position.effectiveDate),
    currentEventId: overview.position.id,
    ownerships,
    ownershipTotal: ownerships.reduce((sum, owner) => sum + owner.ownershipPercentage, 0),
    mainLandlord: ownerships.find((owner) => owner.isMainLandlord) ?? null,
    events: overview.events.map(serializeOwnershipEvent),
    payments: overview.payments.map(serializeOwnershipPayment),
    notes: overview.notes.map(serializeOwnershipNote),
  });
});

export const PUT = apiHandler<{ id: string }>(async (req, { params }) => {
  const { user } = await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const body = await parseBody(req, allocationSchema);
  const event = await prisma.$transaction(
    (tx) => recordAllocationEvent(tx, id, body, user.id),
    { isolationLevel: "Serializable" }
  );
  return ok(serializeOwnershipEvent(event), 201);
});
