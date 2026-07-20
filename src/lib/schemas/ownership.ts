import { z } from "zod";
import { dateOnly } from "@/lib/schemas/tenancy";

export const ownerContactSchema = z.object({
  ownerId: z.uuid().optional(),
  fullName: z.string().trim().min(1).max(300),
  address: z.string().trim().min(1).max(500),
  phone: z.string().trim().max(50).nullish(),
  email: z.string().trim().pipe(z.email()).nullish(),
});

export const allocationOwnerSchema = ownerContactSchema.extend({
  ownershipPercentage: z.number().positive().max(100).multipleOf(0.01),
  isMainLandlord: z.boolean(),
});

export const allocationSchema = z.object({
  mode: z.enum(["sole", "shared"]),
  effectiveFrom: dateOnly,
  expectedCurrentEventId: z.uuid().nullish(),
  reason: z.string().trim().min(1).max(500),
  notes: z.string().max(10_000).nullish(),
  documentFileId: z.uuid().nullish(),
  owners: z.array(allocationOwnerSchema).min(1).max(20),
}).superRefine((value, ctx) => {
  if (value.mode === "sole" && value.owners.length !== 1) {
    ctx.addIssue({ code: "custom", path: ["owners"], message: "Sole ownership requires exactly one owner" });
  }
  if (value.mode === "shared" && value.owners.length < 2) {
    ctx.addIssue({ code: "custom", path: ["owners"], message: "Shared ownership requires at least two owners" });
  }
  const total = value.owners.reduce((sum, owner) => sum + Math.round(owner.ownershipPercentage * 100), 0);
  if (total !== 10_000) {
    ctx.addIssue({ code: "custom", path: ["owners"], message: `Ownership percentages must total 100% (currently ${(total / 100).toFixed(2)}%)` });
  }
  if (value.owners.filter((owner) => owner.isMainLandlord).length !== 1) {
    ctx.addIssue({ code: "custom", path: ["owners"], message: "Select exactly one main landlord" });
  }
});

export const transferPaymentSchema = z.object({
  amountDueCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  amountPaidCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  dueOn: dateOnly.nullish(),
  paidOn: dateOnly.nullish(),
  paymentMethod: z.string().trim().max(100).nullish(),
  reference: z.string().trim().max(200).nullish(),
  throughPropertyFunds: z.boolean().default(false),
  propertyFundDirection: z.enum(["into_property", "out_of_property"]).nullish(),
  allowOverpayment: z.boolean().default(false),
  notes: z.string().max(2000).nullish(),
  documentFileId: z.uuid().nullish(),
}).superRefine((value, ctx) => {
  if (!value.allowOverpayment && value.amountPaidCents > value.amountDueCents) {
    ctx.addIssue({ code: "custom", path: ["amountPaidCents"], message: "Payment cannot exceed the amount due" });
  }
  if (value.throughPropertyFunds !== Boolean(value.propertyFundDirection)) {
    ctx.addIssue({ code: "custom", path: ["propertyFundDirection"], message: "Property-fund payments require an into/out-of-property direction" });
  }
});

export const transferOwnershipSchema = z.object({
  sellerOwnerId: z.uuid(),
  buyer: ownerContactSchema,
  percentageTransferred: z.number().positive().max(100).multipleOf(0.01),
  effectiveDate: dateOnly,
  legalCompletionDate: dateOnly.nullish(),
  transferType: z.enum(["sale", "gift", "inheritance", "correction", "other"]),
  agreedValueCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullish(),
  currency: z.string().trim().length(3).toUpperCase().default("GBP"),
  paymentTreatment: z.enum(["private", "property_funds"]),
  effectiveAfterFullPayment: z.boolean().default(false),
  mainLandlordOwnerId: z.uuid().nullish(),
  makeBuyerMainLandlord: z.boolean().default(false),
  expectedCurrentEventId: z.uuid(),
  notes: z.string().max(10_000).nullish(),
  reason: z.string().trim().min(1).max(500),
  documentFileId: z.uuid().nullish(),
  payments: z.array(transferPaymentSchema).max(100).default([]),
}).superRefine((value, ctx) => {
  if (value.buyer.ownerId === value.sellerOwnerId) {
    ctx.addIssue({ code: "custom", path: ["buyer", "ownerId"], message: "Buyer and seller must be different owners" });
  }
  if (value.effectiveAfterFullPayment) {
    const paid = value.payments.reduce((sum, payment) => sum + payment.amountPaidCents, 0);
    if (paid < (value.agreedValueCents ?? 0)) {
      ctx.addIssue({ code: "custom", path: ["payments"], message: "Ownership cannot become effective until the agreed value is fully paid" });
    }
  }
  if (value.agreedValueCents != null) {
    const scheduled = value.payments.reduce((sum, payment) => sum + payment.amountDueCents, 0);
    if (scheduled > value.agreedValueCents && !value.payments.some((payment) => payment.allowOverpayment)) {
      ctx.addIssue({ code: "custom", path: ["payments"], message: "Payment schedule cannot exceed the agreed transfer value" });
    }
  }
});

export const createOwnershipPaymentSchema = transferPaymentSchema.safeExtend({
  eventId: z.uuid().nullish(),
  kind: z.enum(["private_transfer", "capital_contribution", "capital_withdrawal", "distribution", "property_funded_purchase"]),
  payerOwnerId: z.uuid().nullish(),
  recipientOwnerId: z.uuid().nullish(),
  currency: z.string().trim().length(3).toUpperCase().default("GBP"),
});

export const createOwnershipNoteSchema = z.object({
  ownerId: z.uuid().nullish(),
  eventId: z.uuid().nullish(),
  paymentId: z.uuid().nullish(),
  title: z.string().trim().min(1).max(200),
  noteText: z.string().trim().min(1).max(10_000),
  noteDate: dateOnly,
  sensitivity: z.enum(["workspace", "admins"]).default("workspace"),
  reviewOn: dateOnly.nullish(),
  documentFileId: z.uuid().nullish(),
});

export const reverseOwnershipEventSchema = z.object({
  effectiveDate: dateOnly,
  reason: z.string().trim().min(1).max(500),
  notes: z.string().max(10_000).nullish(),
});

export type AllocationInput = z.output<typeof allocationSchema>;
export type TransferInput = z.output<typeof transferOwnershipSchema>;
export type PaymentInput = z.output<typeof createOwnershipPaymentSchema>;
