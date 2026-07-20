import { conflict, notFound } from "@/lib/api/errors";
import { prisma } from "@/lib/db";
import { addMonths } from "@/lib/dates";
import { deleteReminder, syncComplianceReminder } from "@/lib/reminders";

export const COMPLIANCE_KINDS = [
  "gas_certificate",
  "electrical_eicr",
  "epc",
  "smoke_co_check",
  "selective_licence",
  "inspection",
  "insurance",
  "custom",
] as const;

/** UK default cadences (data, not logic — PLAN.md §1/§8 Q3). */
export const UK_DEFAULT_RECURRENCE: Partial<Record<string, number>> = {
  gas_certificate: 12,
  electrical_eicr: 60,
  epc: 120,
};

export async function getComplianceItemOr404(id: string) {
  const item = await prisma.complianceItem.findUnique({
    where: { id },
    include: { property: true, documentFile: true },
  });
  if (!item) throw notFound("Compliance item");
  return item;
}

/**
 * §5.2 recurrence rollover (semantics per §8 Q7: new due date is
 * completed_on + recurrence months; the SAME row rolls forward).
 */
export async function completeComplianceItem(
  id: string,
  completedOn: Date,
  fileId?: string
) {
  const item = await getComplianceItemOr404(id);
  if (item.completedOn !== null) {
    throw conflict("Compliance item is already completed");
  }
  if (fileId) {
    const file = await prisma.file.findUnique({ where: { id: fileId } });
    if (!file || file.status !== "ready" || file.purpose !== "certificate") {
      throw conflict("Document must be a ready 'certificate' upload");
    }
  }

  return prisma.$transaction(async (tx) => {
    if (item.recurrenceMonths !== null) {
      // Same row rolls forward; the old certificate file is replaced when a
      // new one is attached (per-cycle history is deliberately not kept).
      const updated = await tx.complianceItem.update({
        where: { id },
        data: {
          dueOn: addMonths(completedOn, item.recurrenceMonths),
          completedOn: null,
          ...(fileId ? { documentFileId: fileId } : {}),
        },
        include: { property: true, documentFile: true },
      });
      await syncComplianceReminder(tx, updated);
      // Reset the ladder for the new cycle even though due date changed
      // upstream (defensive; upsert already resets on change).
      await tx.reminder.updateMany({
        where: { subjectType: "compliance_item", subjectId: id },
        data: { lastNotifiedLead: null },
      });
      return updated;
    }
    const updated = await tx.complianceItem.update({
      where: { id },
      data: {
        completedOn,
        ...(fileId ? { documentFileId: fileId } : {}),
      },
      include: { property: true, documentFile: true },
    });
    await deleteReminder(tx, "compliance_item", id);
    return updated;
  });
}
