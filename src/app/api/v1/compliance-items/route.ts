import { z } from "zod";
import { notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { COMPLIANCE_KINDS } from "@/lib/compliance";
import { prisma } from "@/lib/db";
import { parseDateOnly } from "@/lib/dates";
import { syncComplianceReminder } from "@/lib/reminders";
import { dateOnly } from "@/lib/schemas/tenancy";
import { serializeComplianceItem } from "@/lib/serializers";

const createSchema = z.object({
  propertyId: z.uuid(),
  kind: z.enum(COMPLIANCE_KINDS),
  label: z.string().trim().min(1).max(300),
  dueOn: dateOnly,
  recurrenceMonths: z.number().int().min(1).max(240).nullish(),
  documentFileId: z.uuid().nullish(),
  /** Optional per-item reminder lead-day override. */
  leadDays: z.array(z.number().int().min(1).max(365)).min(1).max(6).optional(),
});

/** Create (upserts its reminder per §5.2). */
export const POST = apiHandler(async (req) => {
  await requireAdmin();
  const body = await parseBody(req, createSchema);
  const property = await prisma.property.findUnique({ where: { id: body.propertyId } });
  if (!property) throw notFound("Property");

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.complianceItem.create({
      data: {
        propertyId: body.propertyId,
        kind: body.kind,
        label: body.label,
        dueOn: parseDateOnly(body.dueOn),
        recurrenceMonths: body.recurrenceMonths ?? null,
        documentFileId: body.documentFileId ?? null,
      },
      include: { property: true, documentFile: true },
    });
    await syncComplianceReminder(tx, created);
    if (body.leadDays) {
      await tx.reminder.updateMany({
        where: { subjectType: "compliance_item", subjectId: created.id },
        data: { leadDays: [...body.leadDays].sort((a, b) => b - a) },
      });
    }
    return created;
  });
  return ok(serializeComplianceItem(item), 201);
});
