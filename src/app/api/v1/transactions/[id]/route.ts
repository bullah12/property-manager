import { z } from "zod";
import { ApiError, notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse, parseBody } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseDateOnly, toDateOnly } from "@/lib/dates";
import {
  patchTransactionSchema,
  validateMergedTransaction,
} from "@/lib/schemas/transaction";
import { serializeTransaction } from "@/lib/serializers";

const paramsSchema = z.object({ id: z.uuid() });

/** Correct a mis-entry (PLAN.md §6). */
export const PATCH = apiHandler<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const body = await parseBody(req, patchTransactionSchema);

  const existing = await prisma.transaction.findUnique({ where: { id } });
  if (!existing) throw notFound("Transaction");

  const merged = {
    propertyId: existing.propertyId,
    direction: existing.direction as "income" | "expense",
    tenancyId: body.tenancyId !== undefined ? body.tenancyId : existing.tenancyId,
    category: body.category ?? existing.category,
    amountCents: body.amountCents ?? existing.amountCents,
    occurredOn: body.occurredOn ?? toDateOnly(existing.occurredOn),
    description: body.description !== undefined ? body.description : existing.description,
    receiptFileId:
      body.receiptFileId !== undefined ? body.receiptFileId : existing.receiptFileId,
    rentPeriod:
      body.rentPeriod !== undefined
        ? body.rentPeriod
        : existing.rentPeriod
          ? toDateOnly(existing.rentPeriod)
          : null,
  };
  const issues = validateMergedTransaction(merged);
  if (issues.length) {
    throw new ApiError("VALIDATION_ERROR", "Transaction validation failed", issues);
  }

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      tenancyId: merged.tenancyId,
      category: merged.category,
      amountCents: merged.amountCents,
      occurredOn: parseDateOnly(merged.occurredOn),
      description: merged.description,
      receiptFileId: merged.receiptFileId,
      rentPeriod: merged.rentPeriod ? parseDateOnly(merged.rentPeriod) : null,
    },
    include: { property: true, tenancy: { include: { tenant: true } }, receiptFile: true },
  });
  return ok(serializeTransaction(updated));
});

/** Hard delete — it's a cash log, not a ledger (PLAN.md §1/§6). */
export const DELETE = apiHandler<{ id: string }>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const existing = await prisma.transaction.findUnique({ where: { id } });
  if (!existing) throw notFound("Transaction");
  await prisma.transaction.delete({ where: { id } });
  return ok({ deleted: true });
});
