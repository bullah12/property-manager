import { z } from "zod";
import { CONTRACTOR_TRADE_VALUES } from "@/lib/contractors";
import { DATE_ONLY_RE, parseDateOnly } from "@/lib/dates";

const optionalText = (max: number) => z.string().trim().max(max).nullish();
const websiteSchema = z
  .string()
  .trim()
  .pipe(z.url())
  .refine((value) => value.startsWith("https://") || value.startsWith("http://"), {
    message: "Website must use http:// or https://",
  });

const contractorSchema = z.object({
  businessName: z.string().trim().min(1).max(200),
  contactName: optionalText(200),
  trade: z.enum(CONTRACTOR_TRADE_VALUES),
  email: z.string().trim().toLowerCase().pipe(z.email()).nullish(),
  phone: optionalText(50),
  website: websiteSchema.nullish(),
  serviceArea: optionalText(300),
  registrationNumber: optionalText(100),
  notes: optionalText(10_000),
  status: z.enum(["active", "inactive"]),
});

export const createContractorSchema = contractorSchema.extend({
  status: z.enum(["active", "inactive"]).default("active"),
});

export const patchContractorSchema = contractorSchema.partial();

const contractorReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  reviewedOn: z.string().regex(DATE_ONLY_RE).transform(parseDateOnly),
  workDescription: z.string().trim().min(1).max(500),
  comments: optionalText(5_000),
  wouldHireAgain: z.boolean(),
});

export const createContractorReviewSchema = contractorReviewSchema.extend({
  wouldHireAgain: z.boolean().default(true),
});

export const patchContractorReviewSchema = contractorReviewSchema.partial();
