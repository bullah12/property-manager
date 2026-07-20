import assert from "node:assert/strict";
import test from "node:test";
import { aggregatePortfolioInvestment, type PortfolioInvestmentFact } from "../src/lib/portfolio-investment";

const range = { from: "2025-01-01", to: "2025-12-31" };

test("portfolio totals preserve missing values and label partial coverage", () => {
  const facts: PortfolioInvestmentFact[] = [
    {
      currentValueCents: 10_000_000,
      mortgageBalanceCents: 5_000_000,
      equityCents: 5_000_000,
      cashInvestedCents: 2_000_000,
      grossRentalIncomeCents: 1_000_000,
      netOperatingIncomeCents: 700_000,
      netCashFlowCents: 400_000,
    },
    {
      currentValueCents: null,
      mortgageBalanceCents: 4_000_000,
      equityCents: null,
      cashInvestedCents: null,
      grossRentalIncomeCents: 2_000_000,
      netOperatingIncomeCents: null,
      netCashFlowCents: null,
    },
  ];

  const result = aggregatePortfolioInvestment(facts, range);
  assert.deepEqual(result.metrics.currentValue, {
    valueCents: 10_000_000,
    includedProperties: 1,
    missingProperties: 1,
  });
  assert.deepEqual(result.metrics.mortgageBalance, {
    valueCents: 9_000_000,
    includedProperties: 2,
    missingProperties: 0,
  });
  assert.deepEqual(result.metrics.cashInvested, {
    valueCents: 2_000_000,
    includedProperties: 1,
    missingProperties: 1,
  });
});

test("portfolio ratios aggregate matched numerators and denominators instead of percentages", () => {
  const result = aggregatePortfolioInvestment([
    { currentValueCents: 10_000_000, mortgageBalanceCents: 5_000_000, equityCents: 5_000_000, cashInvestedCents: 1, grossRentalIncomeCents: 1_000_000, netOperatingIncomeCents: 1, netCashFlowCents: 1 },
    { currentValueCents: null, mortgageBalanceCents: 4_000_000, equityCents: null, cashInvestedCents: 1, grossRentalIncomeCents: 2_000_000, netOperatingIncomeCents: 1, netCashFlowCents: 1 },
  ], range);

  assert.equal(result.ratios.ltv.valueBps, 5_000);
  assert.equal(result.ratios.grossYield.valueBps, 1_001);
  assert.equal(result.ratios.ltv.includedProperties, 1);
  assert.equal(result.ratios.grossYield.missingProperties, 1);
});

test("portfolio totals and ratios remain unavailable when every value is missing", () => {
  const result = aggregatePortfolioInvestment([
    { currentValueCents: null, mortgageBalanceCents: null, equityCents: null, cashInvestedCents: null, grossRentalIncomeCents: null, netOperatingIncomeCents: null, netCashFlowCents: null },
  ], range);

  assert.equal(result.metrics.currentValue.valueCents, null);
  assert.equal(result.metrics.netCashFlow.valueCents, null);
  assert.equal(result.ratios.ltv.valueBps, null);
  assert.equal(result.ratios.grossYield.valueBps, null);
});
