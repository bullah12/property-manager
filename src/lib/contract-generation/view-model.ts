import type { Property, Tenancy, Tenant, User } from "@prisma/client";
import { z } from "zod";
import { toDateOnly } from "@/lib/dates";

/**
 * §5.4 step 2: the view model. ALL formatting happens here, never in the
 * template. The Zod schema for template version 'lease/v1' fails loudly on
 * any missing/empty field — a blank never renders.
 */

export const TEMPLATE_VERSION = "lease/v1";

const nonEmpty = z.string().trim().min(1);

export const leaseV1Schema = z.object({
  landlord: z.object({ fullName: nonEmpty }),
  tenant: z.object({ fullName: nonEmpty }),
  property: z.object({
    addressLine1: nonEmpty,
    city: nonEmpty,
    postcode: nonEmpty,
  }),
  tenancy: z.object({
    startDateLong: nonEmpty,
    endDateLong: nonEmpty,
    termMonthsWords: nonEmpty,
    rentAmountLegal: nonEmpty,
    rentDueDayOrdinal: nonEmpty,
    depositAmountLegal: nonEmpty,
    depositSchemeName: nonEmpty,
    depositReference: nonEmpty,
  }),
  clauses: z
    .object({
      pets: z.boolean(),
      petsDescription: z.string().trim().optional(),
      garden: z.boolean(),
    })
    .refine((c) => !c.pets || (c.petsDescription && c.petsDescription.length > 0), {
      message: "petsDescription is required when the pets clause is enabled",
      path: ["petsDescription"],
    }),
});

export type LeaseV1ViewModel = z.infer<typeof leaseV1Schema>;

export interface ClauseInput {
  pets: boolean;
  petsDescription?: string;
  garden: boolean;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "1 September 2026" */
export function formatDateLong(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
];

/** Integer → British English words (supports 0..999,999,999). */
export function numberToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new Error(`numberToWords: invalid ${n}`);
  if (n < 20) return ONES[n];
  if (n < 100) {
    const tens = TENS[Math.floor(n / 10)];
    return n % 10 ? `${tens}-${ONES[n % 10]}` : tens;
  }
  if (n < 1000) {
    const rest = n % 100;
    const head = `${ONES[Math.floor(n / 100)]} hundred`;
    return rest ? `${head} and ${numberToWords(rest)}` : head;
  }
  const units: Array<[number, string]> = [
    [1_000_000_000, "billion"],
    [1_000_000, "million"],
    [1_000, "thousand"],
  ];
  for (const [value, name] of units) {
    if (n >= value) {
      const head = `${numberToWords(Math.floor(n / value))} ${name}`;
      const rest = n % value;
      if (!rest) return head;
      return rest < 100 ? `${head} and ${numberToWords(rest)}` : `${head} ${numberToWords(rest)}`;
    }
  }
  throw new Error(`numberToWords: out of range ${n}`);
}

/** 95000 → "nine hundred and fifty pounds (£950.00)" */
export function moneyLegal(cents: number): string {
  const pounds = Math.floor(cents / 100);
  const pence = cents % 100;
  const poundsWords = `${numberToWords(pounds)} pound${pounds === 1 ? "" : "s"}`;
  const words = pence
    ? `${poundsWords} and ${numberToWords(pence)} pence`
    : poundsWords;
  const numeric = `£${(cents / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  return `${words} (${numeric})`;
}

/** 1 → "1st", 2 → "2nd", 21 → "21st" */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** Whole months between two dates (term length), e.g. 1 Sep 26→31 Aug 27 = 12. */
export function termMonths(start: Date, end: Date): number {
  // end is the last day of the term; the term covers end+1day exclusive.
  const endExclusive = new Date(end);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  let months =
    (endExclusive.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (endExclusive.getUTCMonth() - start.getUTCMonth());
  if (endExclusive.getUTCDate() < start.getUTCDate()) months -= 1;
  return Math.max(months, 1);
}

export function buildLeaseViewModel(opts: {
  owner: User;
  property: Property;
  tenancy: Tenancy;
  tenant: Tenant;
  clauses: ClauseInput;
}): LeaseV1ViewModel {
  const { owner, property, tenancy, tenant, clauses } = opts;
  const months = termMonths(tenancy.startDate, tenancy.endDate);

  const candidate = {
    landlord: { fullName: owner.displayName },
    tenant: { fullName: tenant.fullName },
    property: {
      addressLine1: property.addressLine2
        ? `${property.addressLine1}, ${property.addressLine2}`
        : property.addressLine1,
      city: property.city,
      postcode: property.postcode,
    },
    tenancy: {
      startDateLong: formatDateLong(tenancy.startDate),
      endDateLong: formatDateLong(tenancy.endDate),
      termMonthsWords: `${numberToWords(months)} month${months === 1 ? "" : "s"}`,
      rentAmountLegal: moneyLegal(tenancy.rentAmountCents),
      rentDueDayOrdinal: ordinal(tenancy.rentDueDay),
      depositAmountLegal:
        tenancy.depositAmountCents != null ? moneyLegal(tenancy.depositAmountCents) : "",
      depositSchemeName: tenancy.depositScheme ?? "",
      depositReference: tenancy.depositReference ?? "",
    },
    clauses: {
      pets: clauses.pets,
      ...(clauses.pets ? { petsDescription: clauses.petsDescription } : {}),
      garden: clauses.garden,
    },
  };

  const result = leaseV1Schema.safeParse(candidate);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(
      `lease/v1 view model validation failed (tenancy ${tenancy.id}, ` +
        `dates ${toDateOnly(tenancy.startDate)}–${toDateOnly(tenancy.endDate)}): ${issues}`
    );
  }
  return result.data;
}
