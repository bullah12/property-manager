import { annualise, ratioBps, sumCents } from "@/lib/investment";

export interface PortfolioInvestmentFact {
  currentValueCents: number | null;
  mortgageBalanceCents: number | null;
  equityCents: number | null;
  cashInvestedCents: number | null;
  grossRentalIncomeCents: number | null;
  netOperatingIncomeCents: number | null;
  netCashFlowCents: number | null;
}

function additiveMetric(
  facts: readonly PortfolioInvestmentFact[],
  select: (fact: PortfolioInvestmentFact) => number | null
) {
  const values = facts.map(select).filter((value): value is number => value != null);
  return {
    valueCents: values.length ? sumCents(values) : null,
    includedProperties: values.length,
    missingProperties: facts.length - values.length,
  };
}

export function aggregatePortfolioInvestment(
  facts: readonly PortfolioInvestmentFact[],
  range: { from: string; to: string }
) {
  const valued = facts.filter(
    (fact) => fact.currentValueCents != null && fact.mortgageBalanceCents != null
  );
  const yielded = facts.filter(
    (fact) => fact.currentValueCents != null && fact.grossRentalIncomeCents != null
  );
  const valuedTotal = sumCents(valued.map((fact) => fact.currentValueCents!));

  return {
    metrics: {
      currentValue: additiveMetric(facts, (fact) => fact.currentValueCents),
      mortgageBalance: additiveMetric(facts, (fact) => fact.mortgageBalanceCents),
      equity: additiveMetric(facts, (fact) => fact.equityCents),
      cashInvested: additiveMetric(facts, (fact) => fact.cashInvestedCents),
      grossRentalIncome: additiveMetric(facts, (fact) => fact.grossRentalIncomeCents),
      netOperatingIncome: additiveMetric(facts, (fact) => fact.netOperatingIncomeCents),
      netCashFlow: additiveMetric(facts, (fact) => fact.netCashFlowCents),
    },
    ratios: {
      ltv: {
        valueBps: ratioBps(
          sumCents(valued.map((fact) => fact.mortgageBalanceCents!)),
          valuedTotal
        ),
        includedProperties: valued.length,
        missingProperties: facts.length - valued.length,
      },
      grossYield: {
        valueBps: ratioBps(
          annualise(
            sumCents(yielded.map((fact) => fact.grossRentalIncomeCents!)),
            range.from,
            range.to
          ),
          sumCents(yielded.map((fact) => fact.currentValueCents!))
        ),
        includedProperties: yielded.length,
        missingProperties: facts.length - yielded.length,
      },
    },
  };
}
