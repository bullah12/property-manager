import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse, parseBody } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { COMPLIANCE_KINDS, getComplianceItemOr404 } from "@/lib/compliance";
import { prisma } from "@/lib/db";
import { parseDateOnly } from "@/lib/dates";
import { deleteReminder, syncComplianceReminder } from "@/lib/reminders";
import { dateOnly } from "@/lib/schemas/tenancy";
import { serializeComplianceItem } from "@/lib/serializers";

const paramsSchema = z.object({ id: z.uuid() });

export const GET = apiHandler<{ id: string }>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const item = await getComplianceItemOr404(id);
  return ok(serializeComplianceItem(item));
});

const patchSchema = z
  .object({
    kind: z.enum(COMPLIANCE_KINDS),
    label: z.string().trim().min(1).max(300),
    dueOn: dateOnly,
    recurrenceMonths: z.number().int().min(1).max(240).nullable(),
    documentFileId: z.uuid().nullable(),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "at least one field is required");

/** Edit due date / label / recurrence (resets the reminder ladder) — §6. */
export const PATCH = apiHandler<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const body = await parseBody(req, patchSchema);
  await getComplianceItemOr404(id);

  const item = await prisma.$transaction(async (tx) => {
    const updated = await tx.complianceItem.update({
      where: { id },
      data: {
        ...body,
        ...(body.dueOn ? { dueOn: parseDateOnly(body.dueOn) } : {}),
      },
      include: { property: true, documentFile: true },
    });
    await syncComplianceReminder(tx, updated);
    return updated;
  });
  return ok(serializeComplianceItem(item));
});

/** Remove item + its reminder — §6. */
export const DELETE = apiHandler<{ id: string }>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  await getComplianceItemOr404(id);
  await prisma.$transaction(async (tx) => {
    await tx.complianceItem.delete({ where: { id } });
    await deleteReminder(tx, "compliance_item", id);
  });
  return ok({ deleted: true });
});
