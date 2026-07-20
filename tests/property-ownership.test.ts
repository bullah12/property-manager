import assert from "node:assert/strict";
import test from "node:test";
import { allocateCentsByOwnership, findMainLandlord } from "../src/lib/property-ownership";
import { propertyOwnershipInputSchema } from "../src/lib/schemas/property";
import { createOwnershipPaymentSchema, transferOwnershipSchema } from "../src/lib/schemas/ownership";

const alice = {
  fullName: "Alice Owner",
  address: "1 Main Street, London",
  phone: null,
  email: "alice@example.com",
  ownershipPercentage: 100,
  isMainLandlord: true,
};

test("sole ownership requires one 100% main landlord", () => {
  assert.equal(propertyOwnershipInputSchema.safeParse({ mode: "sole", effectiveFrom: "2026-01-01", owners: [alice] }).success, true);
  assert.equal(
    propertyOwnershipInputSchema.safeParse({
      mode: "sole",
      effectiveFrom: "2026-01-01",
      owners: [{ ...alice, ownershipPercentage: 99 }],
    }).success,
    false
  );
});

test("shared percentages must total exactly 100%", () => {
  const owners = [
    { ...alice, ownershipPercentage: 60 },
    {
      fullName: "Bob Owner",
      address: "2 Main Street, London",
      phone: null,
      email: null,
      ownershipPercentage: 40,
      isMainLandlord: false,
    },
  ];
  assert.equal(propertyOwnershipInputSchema.safeParse({ mode: "shared", effectiveFrom: "2026-01-01", owners }).success, true);
  assert.equal(
    propertyOwnershipInputSchema.safeParse({
      mode: "shared",
      effectiveFrom: "2026-01-01",
      owners: owners.map((owner, index) =>
        index === 1 ? { ...owner, ownershipPercentage: 39.99 } : owner
      ),
    }).success,
    false
  );
});

test("exactly one main landlord is required", () => {
  const second = {
    ...alice,
    fullName: "Bob Owner",
    ownershipPercentage: 50,
  };
  assert.equal(
    propertyOwnershipInputSchema.safeParse({
      mode: "shared",
      effectiveFrom: "2026-01-01",
      owners: [{ ...alice, ownershipPercentage: 50 }, second],
    }).success,
    false
  );
  assert.equal(
    propertyOwnershipInputSchema.safeParse({
      mode: "shared",
      effectiveFrom: "2026-01-01",
      owners: [
        { ...alice, ownershipPercentage: 50, isMainLandlord: false },
        { ...second, isMainLandlord: false },
      ],
    }).success,
    false
  );
});

test("removing the main landlord requires selecting a replacement in the same allocation", () => {
  const replacement = {
    ...alice,
    fullName: "Bob Owner",
    ownershipPercentage: 100,
    isMainLandlord: true,
  };
  assert.equal(
    propertyOwnershipInputSchema.safeParse({ mode: "sole", effectiveFrom: "2026-01-01", owners: [replacement] }).success,
    true
  );
  assert.equal(
    propertyOwnershipInputSchema.safeParse({
      mode: "sole",
      effectiveFrom: "2026-01-01",
      owners: [{ ...replacement, isMainLandlord: false }],
    }).success,
    false
  );
});

test("single-landlord consumers resolve the explicitly designated main owner", () => {
  const main = { fullName: "Main Owner", address: "1 Main Street", phone: null, email: null };
  const secondary = { fullName: "Secondary Owner", address: "2 Main Street", phone: null, email: null };
  assert.equal(
    findMainLandlord([
      { isMainLandlord: false, owner: secondary },
      { isMainLandlord: true, owner: main },
    ]),
    main
  );
});

test("indivisible currency remainders are allocated deterministically", () => {
  assert.deepEqual(
    allocateCentsByOwnership(1, [
      { ownerId: "b", ownershipPercentage: 50 },
      { ownerId: "a", ownershipPercentage: 50 },
    ]),
    [
      { ownerId: "a", amountCents: 1 },
      { ownerId: "b", amountCents: 0 },
    ]
  );
  assert.equal(
    allocateCentsByOwnership(10_001, [
      { ownerId: "a", ownershipPercentage: 60 },
      { ownerId: "b", ownershipPercentage: 40 },
    ]).reduce((sum, row) => sum + row.amountCents, 0),
    10_001
  );
});

test("transfer validation separates private and property-fund payments", () => {
  const base = {
    sellerOwnerId: "11111111-1111-4111-8111-111111111111",
    buyer: {
      fullName: "Buyer",
      address: "1 Buyer Street",
      email: null,
      phone: null,
    },
    percentageTransferred: 25,
    effectiveDate: "2026-08-01",
    legalCompletionDate: "2026-08-01",
    transferType: "sale" as const,
    agreedValueCents: 10_000,
    currency: "GBP",
    paymentTreatment: "private" as const,
    expectedCurrentEventId: "22222222-2222-4222-8222-222222222222",
    reason: "Share sale",
    payments: [{
      amountDueCents: 10_000,
      amountPaidCents: 2_500,
      throughPropertyFunds: false,
      propertyFundDirection: null,
    }],
  };
  assert.equal(transferOwnershipSchema.safeParse(base).success, true);
  assert.equal(
    transferOwnershipSchema.safeParse({
      ...base,
      payments: [{ ...base.payments[0], amountDueCents: 10_001 }],
    }).success,
    false
  );
  assert.equal(
    createOwnershipPaymentSchema.safeParse({
      kind: "capital_contribution",
      payerOwnerId: base.sellerOwnerId,
      amountDueCents: 5_000,
      amountPaidCents: 5_000,
      throughPropertyFunds: true,
      propertyFundDirection: "into_property",
      currency: "GBP",
    }).success,
    true
  );
});
