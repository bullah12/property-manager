import { z } from "zod";

export const PROPERTY_TYPES = ["house", "flat", "hmo", "commercial"] as const;

export const createPropertySchema = z.object({
  nickname: z.string().trim().min(1).max(200),
  addressLine1: z.string().trim().min(1).max(300),
  addressLine2: z.string().trim().max(300).nullish(),
  city: z.string().trim().min(1).max(120),
  postcode: z.string().trim().min(1).max(20),
  propertyType: z.enum(PROPERTY_TYPES),
  bedrooms: z.number().int().min(0).max(100).nullish(),
  purchasePriceCents: z.number().int().min(0).nullish(),
  landlordName: z.string().trim().min(1).max(300),
  landlordAddress: z.string().trim().min(1).max(500),
  landlordPhone: z.string().trim().max(50).nullish(),
  landlordEmail: z.string().trim().pipe(z.email()).nullish(),
  notes: z.string().max(10_000).nullish(),
});

export const patchPropertySchema = createPropertySchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, "at least one field is required");
