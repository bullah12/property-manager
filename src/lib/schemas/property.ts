import { z } from "zod";

export const PROPERTY_TYPES = ["house", "flat", "hmo", "commercial"] as const;

export const ownerInputSchema = z.object({
  ownerId: z.uuid().optional(),
  fullName: z.string().trim().min(1).max(300),
  address: z.string().trim().min(1).max(500),
  phone: z.string().trim().max(50).nullish(),
  email: z.string().trim().pipe(z.email()).nullish(),
  ownershipPercentage: z.number().positive().max(100).multipleOf(0.01),
  isMainLandlord: z.boolean(),
});

export const propertyOwnershipInputSchema = z
  .object({
    mode: z.enum(["sole", "shared"]),
    owners: z.array(ownerInputSchema).min(1).max(20),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "sole" && value.owners.length !== 1) {
      ctx.addIssue({ code: "custom", path: ["owners"], message: "Sole ownership requires exactly one owner" });
    }
    if (value.mode === "shared" && value.owners.length < 2) {
      ctx.addIssue({ code: "custom", path: ["owners"], message: "Shared ownership requires at least two owners" });
    }
    const totalHundredths = value.owners.reduce(
      (total, owner) => total + Math.round(owner.ownershipPercentage * 100),
      0
    );
    if (totalHundredths !== 10_000) {
      ctx.addIssue({
        code: "custom",
        path: ["owners"],
        message: `Ownership percentages must total 100% (currently ${(totalHundredths / 100).toFixed(2)}%)`,
      });
    }
    if (value.owners.filter((owner) => owner.isMainLandlord).length !== 1) {
      ctx.addIssue({ code: "custom", path: ["owners"], message: "Select exactly one main landlord" });
    }
    const ids = value.owners.flatMap((owner) => (owner.ownerId ? [owner.ownerId] : []));
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["owners"], message: "An owner can only be added once" });
    }
    if (value.mode === "sole" && value.owners[0]?.ownershipPercentage !== 100) {
      ctx.addIssue({ code: "custom", path: ["owners", 0, "ownershipPercentage"], message: "A sole owner must own 100%" });
    }
  });

export type PropertyOwnershipInput = z.infer<typeof propertyOwnershipInputSchema>;

export const createPropertySchema = z.object({
  nickname: z.string().trim().min(1).max(200),
  addressLine1: z.string().trim().min(1).max(300),
  addressLine2: z.string().trim().max(300).nullish(),
  city: z.string().trim().min(1).max(120),
  postcode: z.string().trim().min(1).max(20),
  propertyType: z.enum(PROPERTY_TYPES),
  bedrooms: z.number().int().min(0).max(100).nullish(),
  purchasePriceCents: z.number().int().min(0).nullish(),
  ownership: propertyOwnershipInputSchema,
  notes: z.string().max(10_000).nullish(),
});

export const patchPropertySchema = createPropertySchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, "at least one field is required");
