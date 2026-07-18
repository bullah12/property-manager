import { z } from "zod";
import { dateOnly } from "@/lib/schemas/tenancy";

export const INCOME_CATEGORIES = ["rent", "deposit", "other"] as const;
export const EXPENSE_CATEGORIES = [
  "repairs",
  "maintenance",
  "insurance",
  "mortgage_interest",
  "certificates",
  "agent_fees",
  "utilities",
  "other",
] as const;

const base = z.object({
  propertyId: z.uuid(),
  tenancyId: z.uuid().nullish(),
  direction: z.enum(["income", "expense"]),
  category: z.string(),
  amountCents: z.number().int().positive(),
  occurredOn: dateOnly,
  description: z.string().max(2000).nullish(),
  receiptFileId: z.uuid().nullish(),
  rentPeriod: dateOnly.nullish(),
});

/** The DB CHECKs (PLAN.md §3), enforced at the edge too. */
function checkCombos(o: z.output<typeof base>, ctx: z.RefinementCtx) {
  const allowed = o.direction === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  if (!(allowed as readonly string[]).includes(o.category)) {
    ctx.addIssue({
      code: "custom",
      path: ["category"],
      message: `direction '${o.direction}' allows: ${allowed.join(", ")}`,
    });
  }
  const isRent = o.direction === "income" && o.category === "rent";
  if (isRent) {
    if (!o.tenancyId) {
      ctx.addIssue({ code: "custom", path: ["tenancyId"], message: "rent rows require a tenancy" });
    }
    if (!o.rentPeriod) {
      ctx.addIssue({ code: "custom", path: ["rentPeriod"], message: "rent rows require a rentPeriod" });
    } else if (!o.rentPeriod.endsWith("-01")) {
      ctx.addIssue({
        code: "custom",
        path: ["rentPeriod"],
        message: "rentPeriod must be the first of the month (YYYY-MM-01)",
      });
    }
  } else if (o.rentPeriod) {
    ctx.addIssue({
      code: "custom",
      path: ["rentPeriod"],
      message: "rentPeriod is only valid on rent income rows",
    });
  }
}

export const createTransactionSchema = base.superRefine(checkCombos);

export const patchTransactionSchema = base
  .omit({ propertyId: true, direction: true })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "at least one field is required");

/** Merge a patch onto an existing row's fields, then re-check the combos. */
export function validateMergedTransaction(
  merged: z.output<typeof base>
): { field: string; issue: string }[] {
  const res = base.superRefine(checkCombos).safeParse(merged);
  if (res.success) return [];
  return res.error.issues.map((i) => ({
    field: i.path.join(".") || "(root)",
    issue: i.message,
  }));
}
