import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse, parseBody } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordPayment } from "@/lib/property-ownership";
import { createOwnershipPaymentSchema } from "@/lib/schemas/ownership";
import { serializeOwnershipPayment } from "@/lib/serializers";

const paramsSchema = z.object({ id: z.uuid() });

export const POST = apiHandler<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const body = await parseBody(req, createOwnershipPaymentSchema);
  const payment = await prisma.$transaction(
    (tx) => recordPayment(tx, id, body),
    { isolationLevel: "Serializable" }
  );
  return ok(serializeOwnershipPayment(payment), 201);
});
