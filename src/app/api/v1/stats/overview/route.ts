import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { firstOfMonth, parseDateOnly, todayInTimezone, toDateOnly } from "@/lib/dates";
import { deriveRentPeriods, findOverdueRentPeriods } from "@/lib/income";
import { serializeTransaction } from "@/lib/serializers";

/**
 * Overview stat cards (PLAN.md §4): numbers computed server-side, never in
 * the client. Deadlines-due-≤30d joins in with the compliance table (Phase 7).
 */
export const GET = apiHandler(async () => {
  const { user, settings } = await requireAdmin();
  const today = toDateOnly(todayInTimezone(user.timezone));
  const year = parseInt(today.slice(0, 4), 10);
  const currentPeriod = firstOfMonth(parseDateOnly(today));

  // Month's rent: expected vs received for the current period, active tenancies.
  const activeTenancies = await prisma.tenancy.findMany({
    where: { status: "active" },
    include: { tenant: true, property: true },
  });
  let monthExpectedCents = 0;
  let monthReceivedCents = 0;
  for (const t of activeTenancies) {
    const period = deriveRentPeriods(t, currentPeriod.getUTCFullYear()).find(
      (p) => p.period === toDateOnly(currentPeriod)
    );
    if (!period) continue;
    monthExpectedCents += period.expectedCents;
    const received = await prisma.transaction.aggregate({
      _sum: { amountCents: true },
      where: {
        tenancyId: t.id,
        direction: "income",
        category: "rent",
        rentPeriod: currentPeriod,
      },
    });
    monthReceivedCents += received._sum.amountCents ?? 0;
  }
  // Overdue rent: §5.1 pass scope (current + previous period, active tenancies).
  const overdue = await findOverdueRentPeriods(today, settings.rentOverdueGraceDays);

  // YTD expenses across the whole portfolio.
  const ytd = await prisma.transaction.aggregate({
    _sum: { amountCents: true },
    where: {
      direction: "expense",
      occurredOn: { gte: parseDateOnly(`${year}-01-01`) },
    },
  });

  // Deadlines due ≤30 days: reminder rows (currently compliance items) —
  // overdue ones count too, they are still open deadlines.
  const soonCutoff = parseDateOnly(today);
  soonCutoff.setUTCDate(soonCutoff.getUTCDate() + 30);
  const deadlinesDueSoon = await prisma.reminder.count({
    where: { dueOn: { lte: soonCutoff } },
  });

  const recent = await prisma.transaction.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: 10,
    include: { property: true, tenancy: { include: { tenant: true } } },
  });

  return ok({
    today,
    currency: "gbp",
    monthRent: {
      period: toDateOnly(currentPeriod),
      expectedCents: monthExpectedCents,
      receivedCents: monthReceivedCents,
    },
    overdueRent: {
      count: overdue.length,
      items: overdue.map((o) => ({
        tenancyId: o.tenancy.id,
        propertyId: o.tenancy.propertyId,
        propertyNickname: o.tenancy.property.nickname,
        tenantName: o.tenancy.tenant.fullName,
        period: o.period,
        dueDate: o.dueDate,
        expectedCents: o.expectedCents,
        receivedCents: o.receivedCents,
        status: o.status,
        daysLate: o.daysLate,
      })),
    },
    deadlinesDueSoon,
    ytdExpensesCents: ytd._sum.amountCents ?? 0,
    recentActivity: recent.map(serializeTransaction),
  });
});
