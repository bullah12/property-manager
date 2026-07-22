import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { firstOfMonth, parseDateOnly, todayInTimezone, toDateOnly } from "@/lib/dates";
import { deriveRentPeriods } from "@/lib/income";

/**
 * Overview stat cards (PLAN.md §4): numbers computed server-side, never in
 * the client. Deadlines-due-≤30d joins in with the compliance table (Phase 7).
 */
export const GET = apiHandler(async () => {
  const { user } = await requireAdmin();
  const today = toDateOnly(todayInTimezone(user.timezone));
  const year = parseInt(today.slice(0, 4), 10);
  const currentPeriod = firstOfMonth(parseDateOnly(today));
  const soonCutoff = parseDateOnly(today);
  soonCutoff.setUTCDate(soonCutoff.getUTCDate() + 30);

  // These requests are independent, so the four overview cards do not wait
  // for one another's database work. Rent received is one aggregate query,
  // regardless of the number of active tenancies.
  const [activeTenancies, received, ytd, deadlinesDueSoon] = await Promise.all([
    prisma.tenancy.findMany({ where: { status: "active", property: { status: "active" } } }),
    prisma.transaction.aggregate({
      _sum: { amountCents: true },
      where: {
        direction: "income",
        category: "rent",
        rentPeriod: currentPeriod,
        tenancy: { status: "active", property: { status: "active" } },
      },
    }),
    prisma.transaction.aggregate({
      _sum: { amountCents: true },
      where: {
        direction: "expense",
        occurredOn: { gte: parseDateOnly(`${year}-01-01`) },
        property: { status: "active" },
      },
    }),
    prisma.reminder.count({ where: { dueOn: { lte: soonCutoff } } }),
  ]);

  let monthExpectedCents = 0;
  for (const t of activeTenancies) {
    const period = deriveRentPeriods(t, currentPeriod.getUTCFullYear()).find(
      (p) => p.period === toDateOnly(currentPeriod)
    );
    if (!period) continue;
    monthExpectedCents += period.expectedCents;
  }

  return ok({
    today,
    currency: "gbp",
    monthRent: {
      period: toDateOnly(currentPeriod),
      expectedCents: monthExpectedCents,
      receivedCents: received._sum.amountCents ?? 0,
    },
    deadlinesDueSoon,
    ytdExpensesCents: ytd._sum.amountCents ?? 0,
  });
});
