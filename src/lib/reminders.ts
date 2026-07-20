import type { ComplianceItem, Tenancy } from "@prisma/client";
import { currentWorkspaceId, prisma, requireWorkspaceId } from "@/lib/db";
import { toDateOnly } from "@/lib/dates";

/**
 * §5.2 reminder lifecycle — deadline-as-data. Reminders are upserted in the
 * same transaction as the domain write; the polymorphic subject has no hard
 * FK, so these helpers are the only writers.
 */

type Db = Pick<typeof prisma, "reminder" | "workspaceMembership">;

async function defaultLeadDays(db: Db): Promise<number[]> {
  const workspaceId = currentWorkspaceId();
  if (!workspaceId) throw new Error("Reminder writes require a workspace context");
  const membership = await db.workspaceMembership.findFirst({
    where: {
      workspaceId,
      status: "active",
      role: { in: ["owner", "admin"] },
      user: { status: "active" },
    },
    include: { user: { include: { settings: true } } },
  });
  return membership?.user.settings?.defaultLeadDays ?? [60, 30, 7];
}

async function upsertReminder(
  db: Db,
  subjectType: "compliance_item" | "tenancy",
  subjectId: string,
  dueOn: Date
) {
  const existing = await db.reminder.findUnique({
    where: { subjectType_subjectId: { subjectType, subjectId } },
  });
  if (!existing) {
    await db.reminder.create({
      data: {
        workspaceId: requireWorkspaceId(),
        subjectType,
        subjectId,
        dueOn,
        leadDays: await defaultLeadDays(db),
      },
    });
    return;
  }
  const dueChanged = toDateOnly(existing.dueOn) !== toDateOnly(dueOn);
  if (dueChanged) {
    // Edits reset the notification ladder — the next scan re-derives (§5.2).
    await db.reminder.update({
      where: { id: existing.id },
      data: { dueOn, lastNotifiedLead: null },
    });
  }
}

export async function deleteReminder(
  db: Db,
  subjectType: "compliance_item" | "tenancy",
  subjectId: string
) {
  await db.reminder.deleteMany({ where: { subjectType, subjectId } });
}

/** Hook: after any compliance-item create/update (same transaction). */
export async function syncComplianceReminder(db: Db, item: ComplianceItem) {
  if (item.completedOn === null) {
    await upsertReminder(db, "compliance_item", item.id, item.dueOn);
  } else {
    await deleteReminder(db, "compliance_item", item.id);
  }
}

/** Hook: after any tenancy create/update/transition (same transaction). */
export async function syncTenancyReminder(db: Db, tenancy: Tenancy) {
  // Assured periodic tenancies do not expire, so there is no lease-expiry
  // deadline to remind against. Actual endings are recorded in endedOn.
  await deleteReminder(db, "tenancy", tenancy.id);
}

/** Reset a reminder's lead ladder after an explicit lead-days override. */
export async function overrideReminderLeadDays(reminderId: string, leadDays: number[]) {
  return prisma.reminder.update({
    where: { id: reminderId },
    data: { leadDays: [...leadDays].sort((a, b) => b - a), lastNotifiedLead: null },
  });
}

/**
 * Next-fire preview for the UI: the largest lead not yet notified whose fire
 * date is today-or-later relative to the reminder's ladder.
 */
export function nextFirePreview(
  reminder: { dueOn: Date; leadDays: number[]; lastNotifiedLead: number | null },
  today: string
): { lead: number; fireOn: string } | null {
  const sorted = [...reminder.leadDays].sort((a, b) => b - a);
  for (const lead of sorted) {
    if (reminder.lastNotifiedLead !== null && lead >= reminder.lastNotifiedLead) continue;
    const fire = new Date(reminder.dueOn);
    fire.setUTCDate(fire.getUTCDate() - lead);
    const fireOn = toDateOnly(fire);
    if (fireOn >= today) return { lead, fireOn };
  }
  return null;
}
