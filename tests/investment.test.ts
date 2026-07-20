import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateCents,
  allocateDatedAmounts,
  annualise,
  dateRange,
  estimatedRecovery,
  loanBalance,
  ownershipAt,
  ratioBps,
  xirr,
} from "../src/lib/investment";

test("allocates every penny deterministically using largest remainder", () => {
  const result = allocateCents(10, [
    { ownerId: "b", percentageBps: 3333 },
    { ownerId: "a", percentageBps: 3334 },
    { ownerId: "c", percentageBps: 3333 },
  ]);
  assert.deepEqual(Object.fromEntries(result!), { b: 3, a: 4, c: 3 });
  assert.equal([...result!.values()].reduce((sum, value) => sum + value, 0), 10);
});

test("refuses allocation when effective ownership does not total 100%", () => {
  assert.equal(allocateCents(100, [{ ownerId: "a", percentageBps: 5000 }]), null);
});

test("allocates negative equity without losing or creating pennies", () => {
  const result = allocateCents(-101, [
    { ownerId: "a", percentageBps: 5000 },
    { ownerId: "b", percentageBps: 5000 },
  ]);
  assert.equal([...result!.values()].reduce((sum, value) => sum + value, 0), -101);
});

test("uses ownership effective on each transaction date", () => {
  const periods = [
    { ownerId: "a", percentageBps: 10_000, effectiveFrom: "2024-01-01", effectiveTo: "2024-06-30" },
    { ownerId: "a", percentageBps: 6000, effectiveFrom: "2024-07-01", effectiveTo: null },
    { ownerId: "b", percentageBps: 4000, effectiveFrom: "2024-07-01", effectiveTo: null },
  ];
  assert.deepEqual(ownershipAt(periods, "2024-06-30"), [{ ownerId: "a", percentageBps: 10_000 }]);
  const allocation = allocateDatedAmounts([
    { id: "early", date: "2024-06-01", amountCents: 10_000 },
    { id: "late", date: "2024-08-01", amountCents: 10_000 },
  ], periods);
  assert.deepEqual(Object.fromEntries(allocation.totals), { a: 16_000, b: 4_000 });
  assert.deepEqual(allocation.unallocated, []);
});

test("loan balance excludes interest and applies borrowing and principal", () => {
  assert.equal(loanBalance(100_000, [
    { eventType: "interest", amountCents: 500 },
    { eventType: "additional_borrowing", amountCents: 20_000 },
    { eventType: "principal_repayment", amountCents: 30_000 },
  ]), 90_000);
});

test("UK tax year begins on 6 April", () => {
  assert.deepEqual(dateRange({ preset: "tax_year", today: "2026-04-05" }), { from: "2025-04-06", to: "2026-04-05" });
  assert.deepEqual(dateRange({ preset: "tax_year", today: "2026-04-06" }), { from: "2026-04-06", to: "2026-04-06" });
});

test("partial periods annualise and ratios remain unavailable at zero denominator", () => {
  assert.equal(annualise(10_000, "2026-01-01", "2026-01-31"), 117_820);
  assert.equal(ratioBps(100, 0), null);
  assert.equal(ratioBps(-50, 1000), -500);
});

test("recovery date is unavailable for zero or negative cash flow", () => {
  assert.deepEqual(estimatedRecovery({ investedCents: 100_000, recoveredCents: 20_000, recentMonthlyFreeCashFlowCents: 0, asOf: "2026-01-01" }), { remainingCents: 80_000, months: null, date: null });
  assert.deepEqual(estimatedRecovery({ investedCents: 100_000, recoveredCents: 20_000, recentMonthlyFreeCashFlowCents: 10_000, asOf: "2026-01-01" }), { remainingCents: 80_000, months: 8, date: "2026-09-01" });
});

test("XIRR uses actual dates", () => {
  const result = xirr([
    { id: "investment", date: "2025-01-01", amountCents: 100_000, direction: "out" },
    { id: "return", date: "2026-01-01", amountCents: 110_000, direction: "in" },
  ]);
  assert.ok(result != null);
  assert.ok(Math.abs(result - 0.1) < 0.001, `expected about 10%, got ${result}`);
});

test("XIRR is unavailable without both investment and return cash flows", () => {
  assert.equal(xirr([{ id: "only", date: "2025-01-01", amountCents: 100, direction: "out" }]), null);
});
