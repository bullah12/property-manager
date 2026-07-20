import { z } from "zod";
import { dateOnly } from "@/lib/schemas/tenancy";

const cents = z.number().int().positive();
const optionalText = z.string().trim().max(2000).nullish();

export const investmentQuerySchema = z.object({
  preset: z.enum(["this_month", "tax_year", "calendar_year", "last_12_months", "since_purchase", "custom"]).default("since_purchase"),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});

const acquisition = z.object({
  action: z.literal("acquisition"),
  purchasePriceCents: cents,
  purchaseCompletionDate: dateOnly,
});

const acquisitionCost = z.object({
  action: z.literal("acquisition_cost"),
  category: z.enum(["deposit", "purchase_tax", "legal", "survey_valuation", "mortgage_fee", "initial_refurbishment", "furniture_setup", "other"]),
  amountCents: cents,
  occurredOn: dateOnly,
  fundingSource: z.enum(["owner", "financed", "property_funds"]),
  ownerId: z.uuid().nullish(),
  description: optionalText,
}).refine((value) => value.fundingSource !== "owner" || Boolean(value.ownerId), {
  path: ["ownerId"], message: "owner-funded costs require an owner",
});

const ledger = z.object({
  action: z.literal("ledger"),
  ownerId: z.uuid(),
  entryType: z.enum(["initial_contribution", "additional_contribution", "owner_funded_expense", "capital_return", "profit_distribution", "drawing", "adjustment_in", "adjustment_out"]),
  amountCents: cents,
  occurredOn: dateOnly,
  description: optionalText,
  reason: optionalText,
}).refine((value) => !value.entryType.startsWith("adjustment_") || Boolean(value.reason?.trim()), {
  path: ["reason"], message: "adjustments require a reason",
});

const valuation = z.object({
  action: z.literal("valuation"),
  valueCents: cents,
  valuedOn: dateOnly,
  source: z.enum(["purchase", "user", "professional", "estimated"]),
  notes: optionalText,
  evidenceFileId: z.uuid().nullish(),
});

const loan = z.object({
  action: z.literal("loan"),
  name: z.string().trim().min(1).max(300),
  lender: z.string().trim().max(300).nullish(),
  originalBalanceCents: z.number().int().min(0),
  openingBalanceCents: z.number().int().min(0),
  interestRateBps: z.number().int().min(0).nullish(),
  repaymentType: z.enum(["interest_only", "repayment"]),
  monthlyPaymentCents: z.number().int().min(0).nullish(),
  startedOn: dateOnly,
  endsOn: dateOnly.nullish(),
  secured: z.boolean().default(true),
  notes: optionalText,
});

const loanEvent = z.object({
  action: z.literal("loan_event"),
  loanId: z.uuid(),
  eventType: z.enum(["additional_borrowing", "principal_repayment", "interest", "finance_cost", "refinance_in", "refinance_out", "balance_adjustment"]),
  amountCents: cents,
  occurredOn: dateOnly,
  description: optionalText,
});

const forecast = z.object({
  action: z.literal("forecast"),
  expectedMonthlyRentCents: z.number().int().min(0).nullish(),
  rentGrowthBps: z.number().int().min(-10_000).nullish(),
  occupancyBps: z.number().int().min(0).max(10_000).nullish(),
  expenseInflationBps: z.number().int().min(-10_000).nullish(),
  appreciationBps: z.number().int().min(-10_000).nullish(),
  mortgageInterestBps: z.number().int().min(0).nullish(),
  monthlyRepaymentCents: z.number().int().min(0).nullish(),
  horizonMonths: z.number().int().min(1).max(600).default(60),
  targetReturnBps: z.number().int().nullish(),
  targetRecoveryDate: dateOnly.nullish(),
  targetLtvBps: z.number().int().min(0).max(10_000).nullish(),
});

const plannedCost = z.object({
  action: z.literal("planned_cost"),
  category: z.string().trim().min(1).max(100),
  amountCents: cents,
  plannedOn: dateOnly,
  description: optionalText,
});

export const investmentMutationSchema = z.discriminatedUnion("action", [
  acquisition, acquisitionCost, ledger, valuation, loan, loanEvent, forecast, plannedCost,
]);
