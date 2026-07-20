import { prisma } from "@/lib/db";
import { addDays, addMonths, parseDateOnly, toDateOnly } from "@/lib/dates";
import {
  allocateDatedAmounts,
  allocateCents,
  annualise,
  dateRange,
  estimatedRecovery,
  FORMULAS,
  inRange,
  loanBalance,
  ownershipAt,
  ratioBps,
  sumCents,
  xirr,
  type DateRangePreset,
  type DatedAmount,
  type OwnershipSlice,
} from "@/lib/investment";
import { aggregatePortfolioInvestment, type PortfolioInvestmentFact } from "@/lib/portfolio-investment";
import type { PortfolioInvestmentSummaryDto } from "@/lib/investment-types";

const CONTRIBUTIONS = new Set(["initial_contribution", "additional_contribution", "owner_funded_expense", "adjustment_in"]);
const RETURNS = new Set(["capital_return", "profit_distribution", "drawing", "adjustment_out"]);
const OPERATING_INCOME = new Set(["rent", "other"]);
const money = (value: bigint | number | null | undefined) => value == null ? null : Number(value);

export async function getPortfolioInvestmentSummary(opts: {
  preset: DateRangePreset;
  from?: string;
  to?: string;
  today: string;
}): Promise<PortfolioInvestmentSummaryDto> {
  const properties = await prisma.property.findMany({
    include: {
      valuations: { where: { valuedOn: { lte: parseDateOnly(opts.today) } }, orderBy: { valuedOn: "asc" } },
      loans: { include: { events: { orderBy: { occurredOn: "asc" } } } },
      ownerInvestmentEntries: true,
      transactions: { orderBy: { occurredOn: "asc" } },
    },
    orderBy: [{ status: "asc" }, { nickname: "asc" }],
  });
  const active = properties.filter((property) => property.status === "active");
  const earliestPurchase = active
    .map((property) => property.purchaseCompletionDate ? toDateOnly(property.purchaseCompletionDate) : null)
    .filter((date): date is string => date != null && date <= opts.today)
    .sort()[0];
  const range = dateRange({
    preset: opts.preset,
    today: opts.today,
    purchaseDate: earliestPurchase,
    customFrom: opts.from,
    customTo: opts.to,
  });

  const facts: PortfolioInvestmentFact[] = active.map((property) => {
    const periodTransactions = property.transactions.filter((transaction) =>
      inRange(toDateOnly(transaction.occurredOn), range.from, range.to)
    );
    const rent = periodTransactions.filter((transaction) => transaction.direction === "income" && transaction.category === "rent");
    const operatingIncome = periodTransactions.filter((transaction) => transaction.direction === "income" && OPERATING_INCOME.has(transaction.category));
    const operatingExpenses = periodTransactions.filter((transaction) => transaction.direction === "expense" && transaction.category !== "mortgage_interest");
    const interestTransactions = periodTransactions.filter((transaction) => transaction.direction === "expense" && transaction.category === "mortgage_interest");
    const allLoanEvents = property.loans.flatMap((loan) => loan.events);
    const periodLoanEvents = allLoanEvents.filter((event) => inRange(toDateOnly(event.occurredOn), range.from, range.to));
    const unmatchedInterest = periodLoanEvents.filter((event) =>
      ["interest", "finance_cost"].includes(event.eventType) &&
      !interestTransactions.some((transaction) =>
        toDateOnly(transaction.occurredOn) === toDateOnly(event.occurredOn) &&
        transaction.amountCents === Number(event.amountCents)
      )
    );
    const principalCents = sumCents(periodLoanEvents.filter((event) => ["principal_repayment", "refinance_out"].includes(event.eventType)).map((event) => Number(event.amountCents)));
    const interestCents = sumCents(interestTransactions.map((transaction) => transaction.amountCents)) + sumCents(unmatchedInterest.map((event) => Number(event.amountCents)));
    const grossOperatingIncomeCents = sumCents(operatingIncome.map((transaction) => transaction.amountCents));
    const operatingExpensesCents = sumCents(operatingExpenses.map((transaction) => transaction.amountCents));
    const noiCents = grossOperatingIncomeCents - operatingExpensesCents;
    const currentValueCents = money(property.valuations.at(-1)?.valueCents);
    const mortgageBalanceCents = sumCents(property.loans.filter((loan) => loan.secured).map((loan) => loanBalance(
      Number(loan.openingBalanceCents),
      loan.events.filter((event) => toDateOnly(event.occurredOn) <= opts.today).map((event) => ({ ...event, amountCents: Number(event.amountCents) }))
    )));
    const hasCashRecords = property.transactions.length > 0 || allLoanEvents.length > 0;
    const contributedCents = sumCents(property.ownerInvestmentEntries.filter((entry) => CONTRIBUTIONS.has(entry.entryType)).map((entry) => Number(entry.amountCents)));
    const returnedCapitalCents = sumCents(property.ownerInvestmentEntries.filter((entry) => entry.entryType === "adjustment_out" || entry.entryType === "capital_return").map((entry) => Number(entry.amountCents)));
    return {
      currentValueCents,
      mortgageBalanceCents,
      equityCents: currentValueCents == null ? null : currentValueCents - mortgageBalanceCents,
      cashInvestedCents: property.ownerInvestmentEntries.length ? Math.max(0, contributedCents - returnedCapitalCents) : null,
      grossRentalIncomeCents: hasCashRecords ? sumCents(rent.map((transaction) => transaction.amountCents)) : null,
      netOperatingIncomeCents: hasCashRecords ? noiCents : null,
      netCashFlowCents: hasCashRecords ? noiCents - interestCents - principalCents : null,
    };
  });
  const aggregation = aggregatePortfolioInvestment(facts, range);
  const metricLabels: Record<keyof typeof aggregation.metrics, string> = {
    currentValue: "Current estimated value",
    mortgageBalance: "Mortgage balance",
    equity: "Current equity",
    cashInvested: "Total cash invested",
    grossRentalIncome: "Gross rental income",
    netOperatingIncome: "Net operating income",
    netCashFlow: "Net cash flow",
  };
  const warnings: string[] = [];
  for (const [label, metric] of Object.entries(aggregation.metrics)) {
    if (metric.missingProperties > 0) warnings.push(`${metricLabels[label as keyof typeof aggregation.metrics]} excludes ${metric.missingProperties} ${metric.missingProperties === 1 ? "property" : "properties"} with unavailable data.`);
  }

  return {
    range: { ...range, preset: opts.preset },
    accountingBasis: "cash",
    propertiesRepresented: active.length,
    properties: properties.map((property) => ({
      id: property.id,
      nickname: property.nickname,
      address: [property.addressLine1, property.addressLine2, property.city, property.postcode].filter(Boolean).join(", "),
      status: property.status as "active" | "archived",
      hasInvestmentData: property.purchasePriceCents != null || property.valuations.length > 0 || property.loans.length > 0 || property.ownerInvestmentEntries.length > 0 || property.transactions.length > 0,
    })),
    ...aggregation,
    warnings,
  };
}

export async function getInvestmentDashboard(opts: {
  propertyId: string;
  preset: DateRangePreset;
  from?: string;
  to?: string;
  today: string;
}) {
  const property = await prisma.property.findUnique({
    where: { id: opts.propertyId },
    include: {
      ownershipEvents: {
        where: { effectiveDate: { lte: parseDateOnly(opts.today) } },
        include: { allocations: { include: { owner: true } } },
        orderBy: [{ effectiveDate: "asc" }, { recordedAt: "asc" }],
      },
      acquisitionCosts: { orderBy: { occurredOn: "asc" } },
      ownerInvestmentEntries: { include: { owner: true }, orderBy: { occurredOn: "asc" } },
      loans: { include: { events: { orderBy: { occurredOn: "asc" } } } },
      valuations: { orderBy: { valuedOn: "asc" } },
      investmentForecast: true,
      plannedInvestmentCosts: { orderBy: { plannedOn: "asc" } },
      tenancies: { include: { tenant: true }, orderBy: { startDate: "asc" } },
      transactions: { orderBy: { occurredOn: "asc" } },
    },
  });
  if (!property) return null;

  const purchaseDate = property.purchaseCompletionDate ? toDateOnly(property.purchaseCompletionDate) : null;
  const range = dateRange({
    preset: opts.preset,
    today: opts.today,
    purchaseDate,
    customFrom: opts.from,
    customTo: opts.to,
  });
  // Each ownership event stores a complete snapshot. When several events have
  // the same effective date, the last recorded event supersedes earlier ones.
  const effectiveEvents = [...new Map(property.ownershipEvents.map((event) => [toDateOnly(event.effectiveDate), event])).values()];
  const ownership: OwnershipSlice[] = effectiveEvents.flatMap((event, index) => {
    const next = effectiveEvents[index + 1];
    const effectiveTo = next ? toDateOnly(addDays(next.effectiveDate, -1)) : null;
    return event.allocations.map((allocation) => ({
      ownerId: allocation.ownerId,
      percentageBps: Math.round(Number(allocation.ownershipPercentage) * 100),
      effectiveFrom: toDateOnly(event.effectiveDate),
      effectiveTo,
    }));
  });
  const ownerRecords = [...new Map(effectiveEvents.flatMap((event) => event.allocations).map((allocation) => [allocation.ownerId, allocation.owner])).values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
  const periodTransactions = property.transactions.filter((tx) => inRange(toDateOnly(tx.occurredOn), range.from, range.to));
  const incomeTx = periodTransactions.filter((tx) => tx.direction === "income" && OPERATING_INCOME.has(tx.category));
  const expenseTx = periodTransactions.filter((tx) => tx.direction === "expense" && tx.category !== "mortgage_interest");
  const interestTx = periodTransactions.filter((tx) => tx.direction === "expense" && tx.category === "mortgage_interest");

  const allLoanEvents = property.loans.flatMap((loan) => loan.events.map((event) => ({ ...event, loan })));
  const periodLoanEvents = allLoanEvents.filter((event) => inRange(toDateOnly(event.occurredOn), range.from, range.to));
  const principalCents = sumCents(periodLoanEvents.filter((x) => x.eventType === "principal_repayment" || x.eventType === "refinance_out").map((x) => Number(x.amountCents)));
  const transactionInterestCents = sumCents(interestTx.map((x) => x.amountCents));
  const unmatchedInterestEvents = periodLoanEvents.filter((event) =>
    ["interest", "finance_cost"].includes(event.eventType) &&
    !interestTx.some((tx) => toDateOnly(tx.occurredOn) === toDateOnly(event.occurredOn) && tx.amountCents === Number(event.amountCents))
  );
  const mortgageInterestCents = transactionInterestCents + sumCents(unmatchedInterestEvents.map((x) => Number(x.amountCents)));
  const grossIncomeCents = sumCents(incomeTx.map((x) => x.amountCents));
  const rentIncomeCents = sumCents(incomeTx.filter((x) => x.category === "rent").map((x) => x.amountCents));
  const operatingExpensesCents = sumCents(expenseTx.map((x) => x.amountCents));
  const noiCents = grossIncomeCents - operatingExpensesCents;
  const netCashFlowCents = noiCents - mortgageInterestCents - principalCents;

  const currentValuation = [...property.valuations].reverse().find((valuation) => toDateOnly(valuation.valuedOn) <= opts.today) ?? null;
  const currentValueCents = money(currentValuation?.valueCents);
  const currentMortgageBalanceCents = sumCents(property.loans.filter((loan) => loan.secured).map((loan) => loanBalance(
    Number(loan.openingBalanceCents),
    loan.events.filter((event) => toDateOnly(event.occurredOn) <= opts.today).map((event) => ({ ...event, amountCents: Number(event.amountCents) }))
  )));
  const originalMortgageBalanceCents = sumCents(property.loans.filter((loan) => loan.secured).map((loan) => Number(loan.originalBalanceCents)));
  const lifetimePrincipalCents = sumCents(allLoanEvents.filter((event) => event.eventType === "principal_repayment" && toDateOnly(event.occurredOn) <= opts.today).map((event) => Number(event.amountCents)));
  const currentEquityCents = currentValueCents == null ? null : currentValueCents - currentMortgageBalanceCents;
  // A deposit is a funding component of the purchase price, not an additional
  // acquisition cost; including it here would double-count part of the price.
  const acquisitionCostsCents = sumCents(property.acquisitionCosts.filter((x) => x.category !== "deposit").map((x) => Number(x.amountCents)));
  const totalAcquisitionCostCents = property.purchasePriceCents == null ? null : property.purchasePriceCents + acquisitionCostsCents;
  const contributions = property.ownerInvestmentEntries.filter((entry) => CONTRIBUTIONS.has(entry.entryType));
  const returns = property.ownerInvestmentEntries.filter((entry) => RETURNS.has(entry.entryType));
  const totalContributedCents = sumCents(contributions.map((x) => Number(x.amountCents)));
  const capitalRecoveredCents = sumCents(returns.map((x) => Number(x.amountCents)));
  const totalCashInvestedCents = Math.max(0, totalContributedCents - sumCents(property.ownerInvestmentEntries.filter((x) => x.entryType === "adjustment_out" || x.entryType === "capital_return").map((x) => Number(x.amountCents))));
  const appreciationCents = currentValueCents == null || property.purchasePriceCents == null ? null : currentValueCents - property.purchasePriceCents;
  // Principal is cash outflow that creates equal equity, so add it back in total return.
  const totalReturnCents = appreciationCents == null ? null : netCashFlowCents + principalCents + appreciationCents;
  const periodAnnualIncome = annualise(grossIncomeCents, range.from, range.to);
  const periodAnnualNoi = annualise(noiCents, range.from, range.to);
  const debtServiceCents = mortgageInterestCents + principalCents;

  const activeTenancy = property.tenancies.find((tenancy) => tenancy.status === "active");
  const periodDays = Math.max(1, Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000) + 1);
  const occupiedDays = property.tenancies.reduce((sum, tenancy) => {
    const start = Math.max(Date.parse(`${range.from}T00:00:00Z`), tenancy.startDate.getTime());
    const tenancyEnd = tenancy.endedOn ?? tenancy.endDate ?? new Date(`${range.to}T00:00:00Z`);
    const end = Math.min(Date.parse(`${range.to}T00:00:00Z`), tenancyEnd.getTime());
    return sum + Math.max(0, Math.floor((end - start) / 86_400_000) + 1);
  }, 0);
  const occupancyBps = Math.min(10_000, Math.round((occupiedDays * 10_000) / periodDays));

  const datedIncome: DatedAmount[] = incomeTx.map((x) => ({ id: x.id, date: toDateOnly(x.occurredOn), amountCents: x.amountCents }));
  const datedExpenses: DatedAmount[] = [...expenseTx, ...interestTx].map((x) => ({ id: x.id, date: toDateOnly(x.occurredOn), amountCents: x.amountCents }));
  const incomeAllocation = allocateDatedAmounts(datedIncome, ownership);
  const expenseAllocation = allocateDatedAmounts(datedExpenses, ownership);
  const principalAllocation = allocateDatedAmounts(periodLoanEvents.filter((x) => x.eventType === "principal_repayment").map((x) => ({ id: x.id, date: toDateOnly(x.occurredOn), amountCents: Number(x.amountCents) })), ownership);

  const currentSharesForEquity = ownershipAt(ownership, opts.today);
  const currentEquityAllocation = currentEquityCents == null ? null : allocateCents(currentEquityCents, currentSharesForEquity);
  const owners = ownerRecords.map((owner) => {
    const ownerContributions = contributions.filter((entry) => entry.ownerId === owner.id);
    const ownerReturns = returns.filter((entry) => entry.ownerId === owner.id);
    const periodOwnerReturns = ownerReturns.filter((entry) => inRange(toDateOnly(entry.occurredOn), range.from, range.to));
    const contributedCents = sumCents(ownerContributions.map((x) => Number(x.amountCents)));
    const distributionsCents = sumCents(periodOwnerReturns.map((x) => Number(x.amountCents)));
    const lifetimeRecoveredCents = sumCents(ownerReturns.map((x) => Number(x.amountCents)));
    const currentShare = ownershipAt(ownership, opts.today).find((share) => share.ownerId === owner.id)?.percentageBps ?? null;
    const equityCents = currentEquityAllocation?.get(owner.id) ?? null;
    const allocatedIncomeCents = incomeAllocation.totals.get(owner.id) ?? 0;
    const allocatedExpensesCents = expenseAllocation.totals.get(owner.id) ?? 0;
    const allocatedPrincipalCents = principalAllocation.totals.get(owner.id) ?? 0;
    const entitlementCents = Math.max(0, allocatedIncomeCents - allocatedExpensesCents - allocatedPrincipalCents);
    return {
      id: owner.id,
      name: owner.fullName,
      email: owner.email,
      isMainLandlord: effectiveEvents.at(-1)?.allocations.some((allocation) => allocation.ownerId === owner.id && allocation.isMainLandlord) ?? false,
      periods: ownership.filter((period) => period.ownerId === owner.id).map((period) => ({ percentageBps: period.percentageBps, effectiveFrom: period.effectiveFrom, effectiveTo: period.effectiveTo })),
      currentOwnershipBps: currentShare,
      contributedCents,
      allocatedIncomeCents,
      allocatedExpensesCents,
      allocatedPrincipalCents,
      distributionsCents,
      entitlementCents,
      distributionVarianceCents: distributionsCents - entitlementCents,
      currentEquityCents: equityCents,
      recoveredBps: ratioBps(lifetimeRecoveredCents, contributedCents),
      cashOnCashBps: ratioBps(annualise(entitlementCents, range.from, range.to), contributedCents),
      xirr: xirr([
        ...ownerContributions.map((entry) => ({ id: entry.id, date: toDateOnly(entry.occurredOn), amountCents: Number(entry.amountCents), direction: "out" as const })),
        ...ownerReturns.map((entry) => ({ id: entry.id, date: toDateOnly(entry.occurredOn), amountCents: Number(entry.amountCents), direction: "in" as const })),
        ...(equityCents && equityCents > 0 ? [{ id: "equity", date: opts.today, amountCents: equityCents, direction: "in" as const }] : []),
      ]),
    };
  });

  const monthMap = new Map<string, { month: string; incomeCents: number; expensesCents: number; netCashFlowCents: number }>();
  for (const tx of periodTransactions) {
    if (tx.direction === "income" && !OPERATING_INCOME.has(tx.category)) continue;
    const month = toDateOnly(tx.occurredOn).slice(0, 7);
    const row = monthMap.get(month) ?? { month, incomeCents: 0, expensesCents: 0, netCashFlowCents: 0 };
    if (tx.direction === "income") row.incomeCents += tx.amountCents;
    else row.expensesCents += tx.amountCents;
    row.netCashFlowCents = row.incomeCents - row.expensesCents;
    monthMap.set(month, row);
  }
  for (const event of periodLoanEvents.filter((x) => x.eventType === "principal_repayment")) {
    const month = toDateOnly(event.occurredOn).slice(0, 7);
    const row = monthMap.get(month) ?? { month, incomeCents: 0, expensesCents: 0, netCashFlowCents: 0 };
    row.netCashFlowCents -= Number(event.amountCents);
    monthMap.set(month, row);
  }
  const monthly = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  const recent = monthly.slice(-6);
  const recentMonthlyFreeCashFlowCents = recent.length ? Math.round(sumCents(recent.map((x) => x.netCashFlowCents)) / recent.length) : 0;
  const recovery = estimatedRecovery({ investedCents: totalContributedCents, recoveredCents: capitalRecoveredCents, recentMonthlyFreeCashFlowCents, asOf: opts.today });
  const forecastMonthly = property.investmentForecast?.expectedMonthlyRentCents == null
    ? []
    : Array.from({ length: Math.min(property.investmentForecast.horizonMonths, 60) }, (_, index) => {
        const date = addMonths(parseDateOnly(`${opts.today.slice(0, 7)}-01`), index + 1);
        const years = Math.floor(index / 12);
        const grow = (value: number, bps: number | null) => {
          let result = value;
          for (let year = 0; year < years; year++) result = Math.round((result * (10_000 + (bps ?? 0))) / 10_000);
          return result;
        };
        const grossRent = grow(Number(property.investmentForecast!.expectedMonthlyRentCents!), property.investmentForecast!.rentGrowthBps);
        const incomeCents = Math.round((grossRent * (property.investmentForecast!.occupancyBps ?? 10_000)) / 10_000);
        const baselineExpenses = monthly.length ? Math.round(sumCents(monthly.map((x) => x.expensesCents)) / monthly.length) : 0;
        const expensesCents = grow(baselineExpenses, property.investmentForecast!.expenseInflationBps) + sumCents(property.plannedInvestmentCosts.filter((cost) => toDateOnly(cost.plannedOn).slice(0, 7) === toDateOnly(date).slice(0, 7)).map((cost) => Number(cost.amountCents)));
        const netCashFlowCents = incomeCents - expensesCents - Number(property.investmentForecast!.monthlyRepaymentCents ?? 0);
        return { month: toDateOnly(date).slice(0, 7), incomeCents, expensesCents, netCashFlowCents, status: "forecast" as const };
      });
  const expectedForecastCash = forecastMonthly.length ? Math.round(sumCents(forecastMonthly.slice(0, 12).map((x) => x.netCashFlowCents)) / Math.min(12, forecastMonthly.length)) : recentMonthlyFreeCashFlowCents;
  const recoveryScenarios = [
    { scenario: "conservative", monthlyCashFlowCents: Math.round(expectedForecastCash * 0.8) },
    { scenario: "expected", monthlyCashFlowCents: expectedForecastCash },
    { scenario: "optimistic", monthlyCashFlowCents: Math.round(expectedForecastCash * 1.2) },
  ].map((scenario) => ({ ...scenario, ...estimatedRecovery({ investedCents: totalContributedCents, recoveredCents: capitalRecoveredCents, recentMonthlyFreeCashFlowCents: scenario.monthlyCashFlowCents, asOf: opts.today }) }));

  const transactions = [
    ...periodTransactions.map((tx) => ({ id: tx.id, date: toDateOnly(tx.occurredOn), type: tx.direction, category: tx.category, description: tx.description, amountCents: tx.amountCents, owner: null, status: "actual", source: "transaction", sourceHref: tx.direction === "income" ? `?tab=income` : `?tab=expenses`, notes: null })),
    ...property.ownerInvestmentEntries.filter((x) => inRange(toDateOnly(x.occurredOn), range.from, range.to)).map((entry) => ({ id: entry.id, date: toDateOnly(entry.occurredOn), type: RETURNS.has(entry.entryType) ? "distribution" : "contribution", category: entry.entryType, description: entry.description, amountCents: Number(entry.amountCents), owner: entry.owner.fullName, status: "actual", source: "owner_investment_ledger", sourceHref: null, notes: entry.reason })),
    ...periodLoanEvents.map((entry) => ({ id: entry.id, date: toDateOnly(entry.occurredOn), type: "financing", category: entry.eventType, description: entry.description, amountCents: Number(entry.amountCents), owner: null, status: "actual", source: "loan_event", sourceHref: null, notes: entry.loan.name })),
    ...property.acquisitionCosts.filter((x) => inRange(toDateOnly(x.occurredOn), range.from, range.to)).map((entry) => ({ id: entry.id, date: toDateOnly(entry.occurredOn), type: "acquisition", category: entry.category, description: entry.description, amountCents: Number(entry.amountCents), owner: ownerRecords.find((x) => x.id === entry.ownerId)?.fullName ?? null, status: "actual", source: "acquisition_cost", sourceHref: null, notes: entry.fundingSource })),
    ...property.plannedInvestmentCosts.filter((x) => inRange(toDateOnly(x.plannedOn), range.from, range.to)).map((entry) => ({ id: entry.id, date: toDateOnly(entry.plannedOn), type: "expense", category: entry.category, description: entry.description, amountCents: Number(entry.amountCents), owner: null, status: "forecast", source: "planned_cost", sourceHref: null, notes: null })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const issues: Array<{ severity: "warning" | "error"; code: string; message: string }> = [];
  if (property.purchasePriceCents == null) issues.push({ severity: "error", code: "purchase_price", message: "Purchase price is missing." });
  if (!purchaseDate) issues.push({ severity: "error", code: "completion_date", message: "Purchase completion date is missing." });
  if (!property.acquisitionCosts.length) issues.push({ severity: "warning", code: "acquisition_costs", message: "No acquisition costs have been recorded." });
  if (!currentValuation) issues.push({ severity: "error", code: "valuation", message: "A current valuation is required for equity, yield and appreciation." });
  if (!ownerRecords.length) issues.push({ severity: "error", code: "owners", message: "No ownership event has been recorded." });
  const currentShares = ownershipAt(ownership, opts.today);
  if (sumCents(currentShares.map((x) => x.percentageBps)) !== 10_000) issues.push({ severity: "error", code: "ownership_total", message: "Ownership effective today does not total 100%." });
  if ([...incomeAllocation.unallocated, ...expenseAllocation.unallocated, ...principalAllocation.unallocated].length) issues.push({ severity: "error", code: "ownership_gap", message: "Some selected-period records cannot be allocated because ownership history is missing or does not total 100%." });
  if (property.loans.some((loan) => loan.interestRateBps == null)) issues.push({ severity: "warning", code: "loan_interest", message: "A loan is missing its interest rate." });
  if (!property.investmentForecast) issues.push({ severity: "warning", code: "forecast", message: "Forecast assumptions have not been configured." });
  if (property.investmentForecast && monthly.length < 3) issues.push({ severity: "warning", code: "forecast_history", message: "Forecast expense assumptions are based on fewer than three recorded months." });
  if (owners.some((owner) => owner.distributionVarianceCents !== 0)) issues.push({ severity: "warning", code: "distribution_reconciliation", message: "Actual owner distributions differ from selected-period economic entitlements; review the owner breakdown." });
  const transactionKeys = new Set<string>();
  if (property.transactions.some((tx) => {
    const key = `${toDateOnly(tx.occurredOn)}:${tx.direction}:${tx.category}:${tx.amountCents}:${tx.tenancyId ?? ""}`;
    if (transactionKeys.has(key)) return true;
    transactionKeys.add(key);
    return false;
  })) issues.push({ severity: "warning", code: "possible_duplicates", message: "Possible duplicate transactions share the same date, type, category and amount." });

  return {
    property: { id: property.id, nickname: property.nickname, currency: "GBP", purchasePriceCents: property.purchasePriceCents, purchaseCompletionDate: purchaseDate },
    range: { ...range, preset: opts.preset },
    accountingBasis: "cash",
    formulas: FORMULAS,
    metrics: {
      totalAcquisitionCostCents,
      totalCashInvestedCents,
      totalContributedCents,
      currentValueCents,
      currentValuationSource: currentValuation?.source ?? null,
      currentMortgageBalanceCents,
      currentEquityCents,
      grossRentalIncomeCents: rentIncomeCents,
      otherIncomeCents: grossIncomeCents - rentIncomeCents,
      operatingExpensesCents,
      noiCents,
      mortgageInterestCents,
      mortgagePrincipalCents: principalCents,
      netCashFlowCents,
      capitalAppreciationCents: appreciationCents,
      totalReturnCents,
      capitalRecoveredCents,
      recoveredBps: ratioBps(capitalRecoveredCents, totalContributedCents),
      annualisedReturnBps: totalReturnCents == null ? null : ratioBps(annualise(totalReturnCents, range.from, range.to), totalCashInvestedCents),
      currentMonthlyRentCents: activeTenancy?.rentAmountCents ?? null,
      occupancyBps,
      grossYieldBps: currentValueCents == null ? null : ratioBps(periodAnnualIncome, currentValueCents),
      purchaseGrossYieldBps: property.purchasePriceCents == null ? null : ratioBps(periodAnnualIncome, property.purchasePriceCents),
      netYieldBps: currentValueCents == null ? null : ratioBps(periodAnnualNoi, currentValueCents),
      purchaseNetYieldBps: totalAcquisitionCostCents == null ? null : ratioBps(periodAnnualNoi, totalAcquisitionCostCents),
      operatingExpenseRatioBps: ratioBps(operatingExpensesCents, grossIncomeCents),
      cashOnCashBps: ratioBps(annualise(netCashFlowCents, range.from, range.to), totalCashInvestedCents),
      simpleRoiBps: currentEquityCents == null ? null : ratioBps(capitalRecoveredCents + currentEquityCents - totalContributedCents, totalContributedCents),
      equityMultipleBps: currentEquityCents == null ? null : ratioBps(capitalRecoveredCents + currentEquityCents, totalContributedCents),
      xirr: currentEquityCents == null ? null : xirr([
        ...contributions.map((entry) => ({ id: entry.id, date: toDateOnly(entry.occurredOn), amountCents: Number(entry.amountCents), direction: "out" as const })),
        ...returns.map((entry) => ({ id: entry.id, date: toDateOnly(entry.occurredOn), amountCents: Number(entry.amountCents), direction: "in" as const })),
        { id: "current-equity", date: opts.today, amountCents: Math.max(0, currentEquityCents), direction: "in" as const },
      ]),
      returnExcludingAppreciationCents: netCashFlowCents + principalCents,
      ltvBps: currentValueCents == null ? null : ratioBps(currentMortgageBalanceCents, currentValueCents),
      initialLtvBps: property.purchasePriceCents == null ? null : ratioBps(originalMortgageBalanceCents, property.purchasePriceCents),
      equityFromPrincipalCents: lifetimePrincipalCents,
      debtServiceCents,
      breakEvenOccupancyBps: activeTenancy == null ? null : ratioBps(operatingExpensesCents + mortgageInterestCents, Math.round(activeTenancy.rentAmountCents * 12 * periodDays / 365.2425)),
      refinanceHeadroomCents: currentValueCents == null || property.investmentForecast?.targetLtvBps == null ? null : Math.max(0, Math.round(currentValueCents * property.investmentForecast.targetLtvBps / 10_000) - currentMortgageBalanceCents),
      dscrBps: ratioBps(noiCents, debtServiceCents),
      interestCoverageBps: ratioBps(noiCents, mortgageInterestCents),
      recentMonthlyFreeCashFlowCents,
      recovery,
    },
    owners,
    monthly,
    forecastMonthly,
    recoveryScenarios,
    valuations: property.valuations.map((x) => ({ id: x.id, date: toDateOnly(x.valuedOn), valueCents: Number(x.valueCents), source: x.source })),
    equityHistory: property.valuations.map((valuation) => {
      const date = toDateOnly(valuation.valuedOn);
      const mortgageBalanceCents = sumCents(property.loans.filter((loan) => loan.secured && toDateOnly(loan.startedOn) <= date).map((loan) => loanBalance(Number(loan.openingBalanceCents), loan.events.filter((event) => toDateOnly(event.occurredOn) <= date).map((event) => ({ ...event, amountCents: Number(event.amountCents) })))));
      return { date, valueCents: Number(valuation.valueCents), mortgageBalanceCents, equityCents: Number(valuation.valueCents) - mortgageBalanceCents, source: valuation.source };
    }),
    returnBreakdown: [
      { component: "Rental cash flow", amountCents: netCashFlowCents + principalCents },
      { component: "Principal repaid", amountCents: principalCents },
      { component: "Appreciation", amountCents: appreciationCents ?? 0 },
    ],
    loans: property.loans.map((loan) => ({ id: loan.id, name: loan.name, originalBalanceCents: Number(loan.originalBalanceCents), currentBalanceCents: loanBalance(Number(loan.openingBalanceCents), loan.events.filter((event) => toDateOnly(event.occurredOn) <= opts.today).map((event) => ({ ...event, amountCents: Number(event.amountCents) }))), interestRateBps: loan.interestRateBps, repaymentType: loan.repaymentType, monthlyPaymentCents: money(loan.monthlyPaymentCents) })),
    forecast: property.investmentForecast ? { ...property.investmentForecast, expectedMonthlyRentCents: money(property.investmentForecast.expectedMonthlyRentCents), monthlyRepaymentCents: money(property.investmentForecast.monthlyRepaymentCents) } : null,
    transactions,
    expenseBreakdown: Object.entries(expenseTx.reduce<Record<string, number>>((acc, tx) => ({ ...acc, [tx.category]: (acc[tx.category] ?? 0) + tx.amountCents }), {})).map(([category, amountCents]) => ({ category, amountCents })),
    issues,
    disclaimer: "Management information based on entered records; not tax or financial advice.",
  };
}
