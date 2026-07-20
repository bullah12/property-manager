import type { Property, Tenancy, Tenant } from "@prisma/client";
import { z } from "zod";
import { toDateOnly } from "@/lib/dates";

/**
 * Version 2 is the standard England assured-periodic written statement used
 * for tenancies created on or after 1 May 2026. It deliberately validates
 * only information that is required or actually used in the agreement.
 */
export const TEMPLATE_VERSION = "lease/v2";

const nonEmpty = z.string().trim().min(1);
const optionalText = z.string().trim().nullable();

export const leaseV2Schema = z.object({
  landlord: z.object({
    fullName: nonEmpty,
    address: nonEmpty,
    phone: optionalText,
    email: z.string().trim().pipe(z.email()).nullable(),
  }),
  tenant: z.object({
    fullName: nonEmpty,
    phone: optionalText,
    email: z.string().trim().pipe(z.email()).nullable(),
  }),
  property: z.object({ fullAddress: nonEmpty }),
  tenancy: z.object({
    startDateLong: nonEmpty,
    startDateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    rentAmountDisplay: nonEmpty,
    rentDueDayOrdinal: nonEmpty,
    depositTaken: z.boolean(),
    depositAmountDisplay: nonEmpty,
    depositSchemeName: optionalText,
    depositReference: optionalText,
  }),
  clauses: z
    .object({
      pets: z.boolean(),
      petsDescription: z.string().trim().optional(),
      garden: z.boolean(),
      gasSafetyApplies: z.boolean(),
      billsIncluded: z.boolean(),
      billsDescription: z.string().trim().optional(),
    })
    .refine((value) => !value.pets || Boolean(value.petsDescription), {
      message: "petsDescription is required when permission for a pet is recorded",
      path: ["petsDescription"],
    })
    .refine((value) => !value.billsIncluded || Boolean(value.billsDescription), {
      message: "billsDescription is required when bills are included",
      path: ["billsDescription"],
    }),
});

export type LeaseV2ViewModel = z.infer<typeof leaseV2Schema>;

export interface ClauseInput {
  pets: boolean;
  petsDescription?: string;
  garden: boolean;
  gasSafetyApplies?: boolean;
  billsIncluded?: boolean;
  billsDescription?: string;
}

export interface LandlordInput {
  fullName: string;
  address: string;
  phone: string | null;
  email: string | null;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatDateLong(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function moneyDisplay(cents: number): string {
  return `£${(cents / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function ordinal(value: number): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}

export function buildLeaseViewModel(opts: {
  landlord: LandlordInput;
  property: Property;
  tenancy: Tenancy;
  tenant: Tenant;
  clauses: ClauseInput;
}): LeaseV2ViewModel {
  const { landlord, property, tenancy, tenant, clauses } = opts;
  const propertyAddress = [
    property.addressLine1,
    property.addressLine2,
    property.city,
    property.postcode,
    "UK",
  ]
    .filter(Boolean)
    .join(", ");
  const depositTaken = tenancy.depositAmountCents != null && tenancy.depositAmountCents > 0;

  const candidate = {
    landlord: {
      fullName: landlord.fullName,
      address: landlord.address,
      phone: landlord.phone,
      email: landlord.email,
    },
    tenant: {
      fullName: tenant.fullName,
      phone: tenant.phone,
      email: tenant.email,
    },
    property: { fullAddress: propertyAddress },
    tenancy: {
      startDateLong: formatDateLong(tenancy.startDate),
      startDateIso: toDateOnly(tenancy.startDate),
      rentAmountDisplay: moneyDisplay(tenancy.rentAmountCents),
      rentDueDayOrdinal: ordinal(tenancy.rentDueDay),
      depositTaken,
      depositAmountDisplay: depositTaken
        ? moneyDisplay(tenancy.depositAmountCents!)
        : "No tenancy deposit",
      depositSchemeName: tenancy.depositScheme,
      depositReference: tenancy.depositReference,
    },
    clauses: {
      pets: clauses.pets,
      ...(clauses.petsDescription ? { petsDescription: clauses.petsDescription } : {}),
      garden: clauses.garden,
      gasSafetyApplies: clauses.gasSafetyApplies ?? true,
      billsIncluded: clauses.billsIncluded ?? false,
      ...(clauses.billsDescription ? { billsDescription: clauses.billsDescription } : {}),
    },
  };

  const result = leaseV2Schema.safeParse(candidate);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(
      `lease/v2 view model validation failed (tenancy ${tenancy.id}, start ${toDateOnly(tenancy.startDate)}): ${issues}`
    );
  }
  return result.data;
}
