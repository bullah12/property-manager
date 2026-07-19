import type { Tenancy, Tenant, Transaction } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addDays, diffDays, firstOfMonth, parseDateOnly, toDateOnly } from "@/lib/dates";

/**
 * §5.1 rent-overdue detection — expected vs actual, computed on read.
 * No expected-rent rows are ever written; expectations derive from the
 * tenancy, actuals from rent transactions. All date logic takes `today`
 * as a parameter (test-clock rule).
 */

export type MonthStatus = "paid" | "upcoming" | "due" | "overdue" | "partial";

export interface RentPeriod {
  /** First-of-month marker, YYYY-MM-01. */
  period: string;
  dueDate: string;
  expectedCents: number;
}

type RentTerm = Pick<
  Tenancy,
  "startDate" | "endDate" | "endedOn" | "rentDueDay" | "rentAmountCents"
>;

export function deriveRentPeriods(
  tenancy: RentTerm,
  year: number
): RentPeriod[] {
  const start = tenancy.startDate;
  const end =
    tenancy.endedOn && tenancy.endedOn < tenancy.endDate
      ? tenancy.endedOn
      : tenancy.endDate;
  const from = new Date(
    Math.max(firstOfMonth(start).getTime(), Date.UTC(year, 0, 1))
  );
  const to = new Date(Math.min(firstOfMonth(end).getTime(), Date.UTC(year, 11, 1)));

  const out: RentPeriod[] = [];
  for (
    let p = firstOfMonth(from);
    p.getTime() <= to.getTime();
    p = new Date(Date.UTC(p.getUTCFullYear(), p.getUTCMonth() + 1, 1))
  ) {
    const dueDate = addDays(p, tenancy.rentDueDay - 1); // due_day ∈ 1..28, always valid
    // only periods whose due date falls inside the tenancy term count:
    if (dueDate.getTime() >= start.getTime() && dueDate.getTime() <= end.getTime()) {
      out.push({
        period: toDateOnly(p),
        dueDate: toDateOnly(dueDate),
        expectedCents: tenancy.rentAmountCents,
      });
    }
  }
  return out;
}

export function monthStatus(opts: {
  receivedCents: number;
  expectedCents: number;
  dueDate: string;
  today: string;
  graceDays: number;
}): MonthStatus {
  const { receivedCents, expectedCents, dueDate, today, graceDays } = opts;
  if (receivedCents >= expectedCents) return "paid";
  if (today <= dueDate) return "upcoming";
  const graceEnd = toDateOnly(addDays(parseDateOnly(dueDate), graceDays));
  if (today <= graceEnd) return "due";
  if (receivedCents === 0) return "overdue";
  return "partial"; // late and short
}

export interface IncomeCell extends RentPeriod {
  receivedCents: number;
  status: MonthStatus;
  daysLate: number | null;
  transactions: Array<{
    id: string;
    amountCents: number;
    occurredOn: string;
    description: string | null;
  }>;
}

export interface IncomeRow {
  tenancy: {
    id: string;
    status: string;
    startDate: string;
    endDate: string;
    endedOn: string | null;
    rentAmountCents: number;
    rentDueDay: number;
    tenant: { id: string; fullName: string } | null;
  };
  /** Keyed 1–12; null = month outside the tenancy's term ("no tenancy"). */
  months: (IncomeCell | null)[];
  yearTotals: { expectedCents: number; receivedCents: number };
}

export interface IncomeGrid {
  year: number;
  today: string;
  graceDays: number;
  rows: IncomeRow[];
  monthTotals: Array<{ expectedCents: number; receivedCents: number }>;
}

/** GET /properties/:id/income?year= — grid data per §5.1/§4 wireframe 2. */
export async function computeIncomeGrid(opts: {
  propertyId: string;
  year: number;
  today: string;
  graceDays: number;
}): Promise<IncomeGrid> {
  const { propertyId, year, today, graceDays } = opts;

  const yearStart = parseDateOnly(`${year}-01-01`);
  const yearEnd = parseDateOnly(`${year}-12-31`);

  // Active + ended + renewed tenancies whose effective term overlaps the
  // year (drafts have no rent expectation yet). An early-ended tenancy stops
  // at endedOn rather than continuing to its original contractual end date.
  const tenancies = await prisma.tenancy.findMany({
    where: {
      propertyId,
      startDate: { lte: yearEnd },
      OR: [
        { status: { in: ["active", "renewed"] }, endDate: { gte: yearStart } },
        { status: "ended", endedOn: { gte: yearStart } },
      ],
    },
    include: { tenant: true },
    orderBy: { startDate: "asc" },
  });

  const txs = await prisma.transaction.findMany({
    where: {
      tenancyId: { in: tenancies.map((t) => t.id) },
      direction: "income",
      category: "rent",
      rentPeriod: {
        gte: parseDateOnly(`${year}-01-01`),
        lte: parseDateOnly(`${year}-12-01`),
      },
    },
    orderBy: { occurredOn: "asc" },
  });
  const byTenancyPeriod = new Map<string, Transaction[]>();
  for (const tx of txs) {
    const key = `${tx.tenancyId}:${toDateOnly(tx.rentPeriod!)}`;
    const list = byTenancyPeriod.get(key) ?? [];
    list.push(tx);
    byTenancyPeriod.set(key, list);
  }

  const rows: IncomeRow[] = tenancies.map((t: Tenancy & { tenant: Tenant }) => {
    const periods = deriveRentPeriods(t, year);
    const byMonth = new Map(periods.map((p) => [parseInt(p.period.slice(5, 7), 10), p]));
    const months: (IncomeCell | null)[] = [];
    let expTotal = 0;
    let recTotal = 0;
    for (let m = 1; m <= 12; m++) {
      const p = byMonth.get(m);
      if (!p) {
        months.push(null);
        continue;
      }
      const cellTxs = byTenancyPeriod.get(`${t.id}:${p.period}`) ?? [];
      const receivedCents = cellTxs.reduce((s, x) => s + x.amountCents, 0);
      const status = monthStatus({
        receivedCents,
        expectedCents: p.expectedCents,
        dueDate: p.dueDate,
        today,
        graceDays,
      });
      const daysLate =
        status === "overdue" || status === "partial"
          ? diffDays(parseDateOnly(p.dueDate), parseDateOnly(today))
          : null;
      expTotal += p.expectedCents;
      recTotal += receivedCents;
      months.push({
        ...p,
        receivedCents,
        status,
        daysLate,
        transactions: cellTxs.map((x) => ({
          id: x.id,
          amountCents: x.amountCents,
          occurredOn: toDateOnly(x.occurredOn),
          description: x.description,
        })),
      });
    }
    return {
      tenancy: {
        id: t.id,
        status: t.status,
        startDate: toDateOnly(t.startDate),
        endDate: toDateOnly(t.endDate),
        endedOn: t.endedOn ? toDateOnly(t.endedOn) : null,
        rentAmountCents: t.rentAmountCents,
        rentDueDay: t.rentDueDay,
        tenant: t.tenant ? { id: t.tenant.id, fullName: t.tenant.fullName } : null,
      },
      months,
      yearTotals: { expectedCents: expTotal, receivedCents: recTotal },
    };
  });

  const monthTotals = Array.from({ length: 12 }, (_, i) => {
    let expectedCents = 0;
    let receivedCents = 0;
    for (const row of rows) {
      const cell = row.months[i];
      if (cell) {
        expectedCents += cell.expectedCents;
        receivedCents += cell.receivedCents;
      }
    }
    return { expectedCents, receivedCents };
  });

  return { year, today, graceDays, rows, monthTotals };
}

/**
 * §5.1 daily overdue pass scope: for every active tenancy, only the current
 * and previous period relative to `today`. Returns the periods whose status
 * is overdue or partial-late. (Used by the Phase 8 scan; Phase 6 uses it for
 * the overview's overdue count.)
 */
export async function findOverdueRentPeriods(today: string, graceDays: number) {
  const todayDate = parseDateOnly(today);
  const currentPeriod = firstOfMonth(todayDate);
  const previousPeriod = new Date(
    Date.UTC(currentPeriod.getUTCFullYear(), currentPeriod.getUTCMonth() - 1, 1)
  );

  const tenancies = await prisma.tenancy.findMany({
    where: { status: "active" },
    include: { tenant: true, property: true },
  });

  const results: Array<{
    tenancy: (typeof tenancies)[number];
    period: string;
    dueDate: string;
    expectedCents: number;
    receivedCents: number;
    status: MonthStatus;
    daysLate: number;
  }> = [];

  for (const t of tenancies) {
    for (const periodDate of [previousPeriod, currentPeriod]) {
      const year = periodDate.getUTCFullYear();
      const periods = deriveRentPeriods(t, year);
      const period = periods.find((p) => p.period === toDateOnly(periodDate));
      if (!period) continue;
      const received = await prisma.transaction.aggregate({
        _sum: { amountCents: true },
        where: {
          tenancyId: t.id,
          direction: "income",
          category: "rent",
          rentPeriod: periodDate,
        },
      });
      const receivedCents = received._sum.amountCents ?? 0;
      const status = monthStatus({
        receivedCents,
        expectedCents: period.expectedCents,
        dueDate: period.dueDate,
        today,
        graceDays,
      });
      if (status === "overdue" || status === "partial") {
        results.push({
          tenancy: t,
          period: period.period,
          dueDate: period.dueDate,
          expectedCents: period.expectedCents,
          receivedCents,
          status,
          daysLate: diffDays(parseDateOnly(period.dueDate), todayDate),
        });
      }
    }
  }
  return results;
}
