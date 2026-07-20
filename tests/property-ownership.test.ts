import assert from "node:assert/strict";
import test from "node:test";
import { findMainLandlord } from "../src/lib/property-ownership";
import { propertyOwnershipInputSchema } from "../src/lib/schemas/property";

const alice = {
  fullName: "Alice Owner",
  address: "1 Main Street, London",
  phone: null,
  email: "alice@example.com",
  ownershipPercentage: 100,
  isMainLandlord: true,
};

test("sole ownership requires one 100% main landlord", () => {
  assert.equal(propertyOwnershipInputSchema.safeParse({ mode: "sole", owners: [alice] }).success, true);
  assert.equal(
    propertyOwnershipInputSchema.safeParse({
      mode: "sole",
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
  assert.equal(propertyOwnershipInputSchema.safeParse({ mode: "shared", owners }).success, true);
  assert.equal(
    propertyOwnershipInputSchema.safeParse({
      mode: "shared",
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
      owners: [{ ...alice, ownershipPercentage: 50 }, second],
    }).success,
    false
  );
  assert.equal(
    propertyOwnershipInputSchema.safeParse({
      mode: "shared",
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
    propertyOwnershipInputSchema.safeParse({ mode: "sole", owners: [replacement] }).success,
    true
  );
  assert.equal(
    propertyOwnershipInputSchema.safeParse({
      mode: "sole",
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
