import assert from "node:assert/strict";
import test from "node:test";
import { deriveRentPeriods } from "../src/lib/income";
import { parseDateOnly } from "../src/lib/dates";

const baseTenancy = {
  startDate: parseDateOnly("2026-01-01"),
  endDate: parseDateOnly("2026-12-31"),
  endedOn: null,
  rentDueDay: 1,
  rentAmountCents: 95_000,
  status: "active",
};

test("an active assured periodic tenancy expects rent through the reporting year", () => {
  assert.equal(deriveRentPeriods(baseTenancy, 2026).length, 12);
});

test("an early-ended tenancy stops expecting rent after endedOn", () => {
  const periods = deriveRentPeriods(
    { ...baseTenancy, status: "ended", endedOn: parseDateOnly("2026-03-15") },
    2026
  );

  assert.deepEqual(
    periods.map((period) => period.period),
    ["2026-01-01", "2026-02-01", "2026-03-01"]
  );
  assert.equal(
    periods.reduce((total, period) => total + period.expectedCents, 0),
    285_000
  );
});

test("a tenancy cancelled before it starts creates no rent expectations", () => {
  const periods = deriveRentPeriods(
    {
      ...baseTenancy,
      startDate: parseDateOnly("2026-08-01"),
      status: "ended",
      endedOn: parseDateOnly("2026-07-19"),
    },
    2026
  );

  assert.deepEqual(periods, []);
});
