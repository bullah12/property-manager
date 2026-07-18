import { prisma } from "@/lib/db";
import { diffDays, parseDateOnly, toDateOnly } from "@/lib/dates";
import { findOverdueRentPeriods } from "@/lib/income";
import { enqueueJob } from "@/lib/jobs";
import { getOwner, notify } from "@/lib/notify";

/**
 * §5.2 daily scan (08:00 owner-local via cron). Takes `today` as a parameter
 * (test-clock rule) and is idempotent: lead crossings are guarded by
 * last_notified_lead + dedupe keys; the rent pass by dedupe keys alone.
 */
export interface ScanResult {
  today: string;
  leadNotifications: number;
  rentOverdueNotifications: number;
  dedupedCount: number;
}

export async function runDailyScan(today: string): Promise<ScanResult> {
  const owner = await getOwner();
  const graceDays = owner.settings?.rentOverdueGraceDays ?? 3;
  const todayDate = parseDateOnly(today);

  let leadNotifications = 0;
  let dedupedCount = 0;

  // Window: anything whose largest lead could have crossed (max lead 365).
  const windowEnd = new Date(todayDate);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 365);
  const reminders = await prisma.reminder.findMany({
    where: { dueOn: { lte: windowEnd } },
    orderBy: { dueOn: "asc" },
  });

  for (const r of reminders) {
    const daysUntil = diffDays(todayDate, r.dueOn);
    const leads = [...r.leadDays].sort((a, b) => b - a);
    for (const lead of leads) {
      if (daysUntil <= lead && (r.lastNotifiedLead === null || r.lastNotifiedLead > lead)) {
        const subject = await loadSubject(r.subjectType, r.subjectId);
        if (!subject) {
          // Orphaned reminder (subject gone) — clean it up.
          await prisma.reminder.delete({ where: { id: r.id } });
          break;
        }
        const type = r.subjectType === "compliance_item" ? "cert.expiring" : "lease.expiring";
        const id = await notify(owner.id, type, {
          title: subject.title(daysUntil),
          body: subject.body,
          linkPath: subject.linkPath,
          dedupeKey: `${type}:${r.id}:${lead}`,
        });
        if (id) leadNotifications++;
        else dedupedCount++;
        await prisma.reminder.update({
          where: { id: r.id },
          data: { lastNotifiedLead: lead },
        });
        break; // at most one lead fires per scan (§5.2)
      }
    }
  }

  // §5.1 rent-overdue pass: current + previous period, active tenancies.
  let rentOverdueNotifications = 0;
  const overdue = await findOverdueRentPeriods(today, graceDays);
  for (const o of overdue) {
    const outstanding = o.expectedCents - o.receivedCents;
    const id = await notify(owner.id, "rent.overdue", {
      title: `Rent overdue — ${o.tenancy.tenant.fullName} at ${o.tenancy.property.nickname}`,
      body: `£${(outstanding / 100).toFixed(2)} outstanding for ${o.period.slice(0, 7)} (due ${o.dueDate}, ${o.daysLate} days late).`,
      linkPath: `/properties/${o.tenancy.propertyId}?tab=income`,
      dedupeKey: `rent.overdue:${o.tenancy.id}:${o.period}`,
    });
    if (id) rentOverdueNotifications++;
    else dedupedCount++;
  }

  // Orphan-file sweep rides along with the daily scan (§5.2).
  await enqueueJob("files.orphan_sweep", {});

  return { today, leadNotifications, rentOverdueNotifications, dedupedCount };
}

async function loadSubject(
  subjectType: string,
  subjectId: string
): Promise<{ title: (daysUntil: number) => string; body: string; linkPath: string } | null> {
  if (subjectType === "compliance_item") {
    const item = await prisma.complianceItem.findUnique({
      where: { id: subjectId },
      include: { property: true },
    });
    if (!item) return null;
    const due = toDateOnly(item.dueOn);
    return {
      title: (d) =>
        d < 0
          ? `${item.label} overdue at ${item.property.nickname}`
          : `${item.label} due in ${d} day${d === 1 ? "" : "s"} at ${item.property.nickname}`,
      body: `${item.label} for ${item.property.nickname} is due on ${due}.`,
      linkPath: `/properties/${item.propertyId}?tab=notifications`,
    };
  }
  const tenancy = await prisma.tenancy.findUnique({
    where: { id: subjectId },
    include: { property: true, tenant: true },
  });
  if (!tenancy) return null;
  const end = toDateOnly(tenancy.endDate);
  return {
    title: (d) =>
      d < 0
        ? `Tenancy expired at ${tenancy.property.nickname}`
        : `Tenancy ends in ${d} day${d === 1 ? "" : "s"} at ${tenancy.property.nickname}`,
    body: `${tenancy.tenant.fullName}'s tenancy at ${tenancy.property.nickname} ends on ${end}. Renew or plan the changeover.`,
    linkPath: `/properties/${tenancy.propertyId}?tab=tenancy`,
  };
}
