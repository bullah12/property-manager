import { addMonths, diffDays, parseDateOnly, toDateOnly } from "@/lib/dates";

/**
 * Investment calculations are cash-basis and use integer minor units. Rates
 * are basis points (10000 = 100%). Floating point is used only for ratios and
 * iterative return rates, never to add or allocate money.
 */

export type DateRangePreset =
  | "this_month"
  | "tax_year"
  | "calendar_year"
  | "last_12_months"
  | "since_purchase"
  | "custom";

export interface DatedAmount {
  id: string;
  date: string;
  amountCents: number;
}

export interface OwnershipSlice {
  ownerId: string;
  percentageBps: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface CashFlow extends DatedAmount {
  direction: "in" | "out";
}

export function dateRange(opts: {
  preset: DateRangePreset;
  today: string;
  purchaseDate?: string | null;
  customFrom?: string;
  customTo?: string;
  taxYearStart?: { month: number; day: number };
}) {
  const today = parseDateOnly(opts.today);
  const year = today.getUTCFullYear();
  let from: Date;
  let to = today;
  switch (opts.preset) {
    case "this_month":
      from = new Date(Date.UTC(year, today.getUTCMonth(), 1));
      break;
    case "calendar_year":
      from = new Date(Date.UTC(year, 0, 1));
      break;
    case "tax_year": {
      const start = opts.taxYearStart ?? { month: 4, day: 6 };
      const candidate = new Date(Date.UTC(year, start.month - 1, start.day));
      from = today < candidate
        ? new Date(Date.UTC(year - 1, start.month - 1, start.day))
        : candidate;
      break;
    }
    case "last_12_months":
      from = addMonths(today, -12);
      from.setUTCDate(from.getUTCDate() + 1);
      break;
    case "since_purchase":
      from = opts.purchaseDate ? parseDateOnly(opts.purchaseDate) : new Date(Date.UTC(year, 0, 1));
      break;
    case "custom":
      from = parseDateOnly(opts.customFrom ?? opts.today);
      to = parseDateOnly(opts.customTo ?? opts.today);
      break;
  }
  return { from: toDateOnly(from), to: toDateOnly(to) };
}

export function inRange(date: string, from: string, to: string) {
  return date >= from && date <= to;
}

export function sumCents(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}

export function ratioBps(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator * 10_000) / denominator);
}

/** Stable largest-remainder allocation; ties go to lexicographically first ID. */
export function allocateCents(
  amountCents: number,
  shares: readonly { ownerId: string; percentageBps: number }[]
) {
  const totalBps = sumCents(shares.map((share) => share.percentageBps));
  if (totalBps !== 10_000) return null;
  const sign = amountCents < 0 ? -1 : 1;
  const absoluteCents = Math.abs(amountCents);
  const rows = shares.map((share) => {
    const numerator = absoluteCents * share.percentageBps;
    return {
      ownerId: share.ownerId,
      amountCents: Math.floor(numerator / 10_000),
      remainder: numerator % 10_000,
    };
  });
  const remainder = absoluteCents - sumCents(rows.map((row) => row.amountCents));
  const order = [...rows].sort(
    (a, b) => b.remainder - a.remainder || a.ownerId.localeCompare(b.ownerId)
  );
  for (let index = 0; index < remainder; index++) order[index].amountCents += 1;
  return new Map(rows.map((row) => [row.ownerId, row.amountCents * sign]));
}

export function ownershipAt(periods: readonly OwnershipSlice[], date: string) {
  return periods
    .filter((period) => period.effectiveFrom <= date && (!period.effectiveTo || period.effectiveTo >= date))
    .map(({ ownerId, percentageBps }) => ({ ownerId, percentageBps }));
}

export function allocateDatedAmounts(amounts: readonly DatedAmount[], periods: readonly OwnershipSlice[]) {
  const totals = new Map<string, number>();
  const unallocated: string[] = [];
  for (const amount of amounts) {
    const allocated = allocateCents(amount.amountCents, ownershipAt(periods, amount.date));
    if (!allocated) {
      unallocated.push(amount.id);
      continue;
    }
    for (const [ownerId, cents] of allocated) totals.set(ownerId, (totals.get(ownerId) ?? 0) + cents);
  }
  return { totals, unallocated };
}

export function loanBalance(
  openingBalanceCents: number,
  events: readonly { eventType: string; amountCents: number }[]
) {
  return Math.max(
    0,
    events.reduce((balance, event) => {
      if (["additional_borrowing", "refinance_in"].includes(event.eventType)) return balance + event.amountCents;
      if (["principal_repayment", "refinance_out"].includes(event.eventType)) return balance - event.amountCents;
      if (event.eventType === "balance_adjustment") return event.amountCents;
      return balance;
    }, openingBalanceCents)
  );
}

export function xirr(cashFlows: readonly CashFlow[]): number | null {
  if (cashFlows.length < 2 || !cashFlows.some((x) => x.direction === "in") || !cashFlows.some((x) => x.direction === "out")) return null;
  const sorted = [...cashFlows].sort((a, b) => a.date.localeCompare(b.date));
  const first = parseDateOnly(sorted[0].date);
  const values = sorted.map((flow) => ({
    value: flow.direction === "in" ? flow.amountCents : -flow.amountCents,
    years: diffDays(first, parseDateOnly(flow.date)) / 365.2425,
  }));
  const npv = (rate: number) => values.reduce((sum, item) => sum + item.value / Math.pow(1 + rate, item.years), 0);
  let low = -0.9999;
  let high = 10;
  let lowValue = npv(low);
  let highValue = npv(high);
  if (lowValue * highValue > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const value = npv(mid);
    if (Math.abs(value) < 0.005) return Math.round(mid * 1_000_000) / 1_000_000;
    if (value * lowValue > 0) {
      low = mid;
      lowValue = value;
    } else {
      high = mid;
      highValue = value;
    }
  }
  void highValue;
  return Math.round(((low + high) / 2) * 1_000_000) / 1_000_000;
}

export function annualise(amountCents: number, from: string, to: string) {
  const days = Math.max(1, diffDays(parseDateOnly(from), parseDateOnly(to)) + 1);
  return Math.round((amountCents * 365.2425) / days);
}

export function estimatedRecovery(opts: {
  investedCents: number;
  recoveredCents: number;
  recentMonthlyFreeCashFlowCents: number;
  asOf: string;
}) {
  const remainingCents = Math.max(0, opts.investedCents - opts.recoveredCents);
  if (remainingCents === 0) return { remainingCents, months: 0, date: opts.asOf };
  if (opts.recentMonthlyFreeCashFlowCents <= 0) return { remainingCents, months: null, date: null };
  const months = Math.ceil(remainingCents / opts.recentMonthlyFreeCashFlowCents);
  return { remainingCents, months, date: toDateOnly(addMonths(parseDateOnly(opts.asOf), months)) };
}

export const FORMULAS = {
  totalAcquisitionCost: "Purchase price plus purchase taxes, legal, survey, mortgage, refurbishment, furniture/setup and other acquisition costs. The deposit is part of the purchase price and is not added again.",
  totalCashInvested: "Owner contributions plus owner-funded expenses and inward adjustments, less outward adjustments and capital returned.",
  noi: "Actual operating income less operating expenses; excludes financing, owner cash movements, tax, depreciation and deposits.",
  netCashFlow: "NOI less mortgage interest, finance costs and principal repayments.",
  currentEquity: "Latest valuation less outstanding secured loan balances.",
  grossYield: "Annualised gross operating income divided by latest property valuation.",
  netYield: "Annualised NOI divided by latest property valuation.",
  roi: "Cumulative net benefit divided by actual cash invested.",
  cashOnCash: "Annualised pre-tax cash flow after financing divided by actual cash invested.",
  equityMultiple: "Cash returned plus currently attributable equity divided by invested equity.",
  ltv: "Outstanding secured debt divided by latest property valuation.",
  dscr: "NOI divided by debt service (interest, finance charges and principal).",
  interestCoverage: "NOI divided by mortgage interest and finance charges.",
  capitalRecovered: "Capital returns, profit distributions and drawings actually paid; excludes unrealised appreciation.",
} as const;
