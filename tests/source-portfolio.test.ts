import assert from "node:assert/strict";
import test from "node:test";
import {
  SOURCE_PROPERTIES,
  SOURCE_LEDGER_RECONCILIATION,
  SOURCE_TOTALS,
  SOURCE_TRANSACTIONS,
  SOURCE_WORKBOOK_SHA256,
} from "../db/source-data/rental-income-sample";

test("source portfolio reconciles to the Assets sheet", () => {
  assert.equal(SOURCE_PROPERTIES.length, 4);
  assert.equal(SOURCE_TOTALS.currentMonthlyIncomeCents, 512_500);
  assert.equal(SOURCE_TOTALS.potentialMonthlyIncomeCents, 630_000);
  assert.match(SOURCE_WORKBOOK_SHA256, /^[a-f0-9]{64}$/);
});

test("every technical ownership allocation balances to 100%", () => {
  for (const property of SOURCE_PROPERTIES) {
    const hundredths = property.owners.reduce(
      (sum, owner) => sum + Math.round(owner.ownershipPercentage * 100),
      0,
    );
    assert.equal(hundredths, 10_000, property.nickname);
    assert.equal(property.owners.filter((owner) => owner.isMainLandlord).length, 1, property.nickname);
  }
});

test("formula-derived shares retain their confidence labels", () => {
  const birmingham = SOURCE_PROPERTIES.find((property) => property.key === "birmingham");
  const yarmRoad = SOURCE_PROPERTIES.find((property) => property.key === "yarm-road");
  const harehills = SOURCE_PROPERTIES.find((property) => property.key === "harehills");

  assert.equal(birmingham?.ownershipStatus, "inferred");
  assert.deepEqual(birmingham?.owners.map((owner) => owner.ownershipPercentage), [9.12, 90.88]);
  assert.equal(yarmRoad?.ownershipStatus, "inferred");
  assert.deepEqual(yarmRoad?.owners.map((owner) => owner.ownershipPercentage), [50, 50]);
  assert.equal(harehills?.ownershipStatus, "pending");
});

test("rent ledger rows are linked to a dated tenancy and normalized period", () => {
  assert.equal(SOURCE_TRANSACTIONS.length, 53);
  const rentRows = SOURCE_TRANSACTIONS.filter((transaction) => transaction.category === "rent");
  assert.ok(rentRows.length > 0);
  for (const row of rentRows) {
    assert.ok(row.tenancyKey, row.sourceReference);
    assert.match(row.rentPeriod ?? "", /^\d{4}-\d{2}-01$/, row.sourceReference);
  }
  assert.equal(new Set(SOURCE_TRANSACTIONS.map((row) => row.sourceReference)).size, SOURCE_TRANSACTIONS.length);
});

test("dated imports reconcile to workbook totals after explicit undated exclusions", () => {
  for (const [key, reconciliation] of Object.entries(SOURCE_LEDGER_RECONCILIATION)) {
    const transactions = SOURCE_TRANSACTIONS.filter((row) =>
      key === "harehills" ? row.propertyKey === "harehills" : row.propertyKey === "birmingham",
    );
    const importedIncome = transactions
      .filter((row) => row.direction === "income")
      .reduce((sum, row) => sum + row.amountCents, 0);
    const importedExpenses = transactions
      .filter((row) => row.direction === "expense")
      .reduce((sum, row) => sum + row.amountCents, 0);
    assert.equal(importedIncome, reconciliation.importedDatedIncomeCents, key);
    assert.equal(importedExpenses, reconciliation.importedDatedExpenseCents, key);
    assert.equal(
      reconciliation.importedDatedIncomeCents + reconciliation.excludedUndatedIncomeCents,
      reconciliation.workbookIncomeCents,
      key,
    );
    assert.equal(
      reconciliation.importedDatedExpenseCents + reconciliation.excludedUndatedExpenseCents,
      reconciliation.workbookExpenseCents,
      key,
    );
  }
});
