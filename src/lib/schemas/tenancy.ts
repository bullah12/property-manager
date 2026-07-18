import { z } from "zod";
import { DATE_ONLY_RE } from "@/lib/dates";

export const dateOnly = z.string().regex(DATE_ONLY_RE, "Expected YYYY-MM-DD");

export const createTenantSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().pipe(z.email()).nullish(),
  phone: z.string().trim().max(50).nullish(),
  notes: z.string().max(10_000).nullish(),
});

export const patchTenantSchema = createTenantSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, "at least one field is required");

const tenancyFields = z.object({
  propertyId: z.uuid(),
  tenantId: z.uuid(),
  startDate: dateOnly,
  endDate: dateOnly,
  rentAmountCents: z.number().int().positive(),
  rentDueDay: z.number().int().min(1).max(28),
  depositAmountCents: z.number().int().min(0).nullish(),
  depositScheme: z.string().trim().max(200).nullish(),
  depositReference: z.string().trim().max(200).nullish(),
});

export const createTenancySchema = tenancyFields.refine(
  (o) => o.endDate > o.startDate,
  { message: "endDate must be after startDate", path: ["endDate"] }
);

export const patchTenancySchema = tenancyFields
  .omit({ propertyId: true, tenantId: true })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "at least one field is required");

/** Renew: successor draft pre-filled from the predecessor; all overridable. */
export const renewTenancySchema = tenancyFields
  .omit({ propertyId: true, tenantId: true })
  .partial();
