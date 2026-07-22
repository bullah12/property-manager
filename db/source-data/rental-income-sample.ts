export const SOURCE_WORKBOOK = "Rental Income sample.xlsx";
export const SOURCE_WORKBOOK_SHA256 = "046a5bfdd0e2885738306650865abbac587c6a30199f787515d9cddf24631908";
export const SOURCE_SNAPSHOT_DATE = "2026-07-22";

export type OwnershipStatus = "verified" | "inferred" | "pending";
export type IncomeBasis = "gross_property" | "owner_share";

export interface SourceOwnerAllocation {
  key: string;
  fullName: string;
  address: string;
  ownershipPercentage: number;
  isMainLandlord: boolean;
}

export interface SourceProperty {
  key: "middlesbrough" | "birmingham" | "harehills" | "yarm-road";
  id: string;
  nickname: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  postcode: string;
  propertyType: "house" | "commercial";
  bedrooms: number | null;
  currentMonthlyIncomeCents: number;
  potentialMonthlyIncomeCents: number;
  incomeBasis: IncomeBasis;
  ownershipStatus: OwnershipStatus;
  ownershipEffectiveFrom: string;
  sourceReference: string;
  notes: string;
  owners: SourceOwnerAllocation[];
}

const ZULFIQAR: Omit<SourceOwnerAllocation, "ownershipPercentage" | "isMainLandlord"> = {
  key: "zulfiqar",
  fullName: "Zulfiqar Ali Taj",
  address: "25 Aiskew Grove, Stockton-on-Tees TS19 7QS, UK",
};

const unknownOwner = (key: string, label: string, ownershipPercentage: number): SourceOwnerAllocation => ({
  key,
  fullName: label,
  address: "Identity and address not provided in the source workbook",
  ownershipPercentage,
  isMainLandlord: false,
});

export const SOURCE_PROPERTIES: SourceProperty[] = [
  {
    key: "middlesbrough",
    id: "11111111-1111-4111-8111-111111111201",
    nickname: "Middlesbrough House",
    addressLine1: "Full street address not provided",
    addressLine2: null,
    city: "Middlesbrough",
    postcode: "Not provided",
    propertyType: "house",
    bedrooms: 3,
    currentMonthlyIncomeCents: 85_000,
    potentialMonthlyIncomeCents: 85_000,
    incomeBasis: "owner_share",
    ownershipStatus: "inferred",
    ownershipEffectiveFrom: SOURCE_SNAPSHOT_DATE,
    sourceReference: "Assets!A2:F2",
    notes: "Workbook source: Assets!A2:F2. The asset is not labelled as shared, so sole ownership is inferred rather than legally verified. Current and potential figures are the owner's monthly income share.",
    owners: [{ ...ZULFIQAR, ownershipPercentage: 100, isMainLandlord: true }],
  },
  {
    key: "birmingham",
    id: "11111111-1111-4111-8111-111111111202",
    nickname: "Alum Rock Road House",
    addressLine1: "Alum Rock Road",
    addressLine2: null,
    city: "Birmingham",
    postcode: "Not provided",
    propertyType: "house",
    bedrooms: 3,
    currentMonthlyIncomeCents: 105_000,
    potentialMonthlyIncomeCents: 130_000,
    incomeBasis: "owner_share",
    ownershipStatus: "inferred",
    ownershipEffectiveFrom: "2022-04-01",
    sourceReference: "Assets!A3:F3; Brummy 22-23-24!J43",
    notes: "Workbook source: Assets!A3:F3 and Brummy 22-23-24!J43. The historical distribution formula is (15500 / 170000) × net result, or 9.117647%; the site stores 9.12% because ownership supports two decimal places. The remaining 90.88% is grouped as unidentified ownership interest. Treat this as an economic-share inference, not verified title ownership.",
    owners: [
      { ...ZULFIQAR, ownershipPercentage: 9.12, isMainLandlord: true },
      unknownOwner("birmingham-other", "Other owner interest (identity pending)", 90.88),
    ],
  },
  {
    key: "harehills",
    id: "11111111-1111-4111-8111-111111111203",
    nickname: "Harehills Road Shops",
    addressLine1: "Harehills Road",
    addressLine2: null,
    city: "Leeds",
    postcode: "Not provided",
    propertyType: "commercial",
    bedrooms: null,
    currentMonthlyIncomeCents: 280_000,
    potentialMonthlyIncomeCents: 320_000,
    incomeBasis: "owner_share",
    ownershipStatus: "pending",
    ownershipEffectiveFrom: SOURCE_SNAPSHOT_DATE,
    sourceReference: "Assets!A4:F4; Leeds Shop 22!A1:H30",
    notes: "Workbook source: Assets!A4:F4 and Leeds Shop 22!A1:H30. The asset is explicitly a shared shop and the ledger names multiple accounts, but no ownership percentage is stated. The 100% allocation shown in the ownership ledger is a temporary technical allocation only and must not be treated as verified. The 2022 ledger also shows a shop plus three flats, so the record is classified as commercial/mixed-use pending fuller details.",
    owners: [{ ...ZULFIQAR, ownershipPercentage: 100, isMainLandlord: true }],
  },
  {
    key: "yarm-road",
    id: "11111111-1111-4111-8111-111111111204",
    nickname: "Yarm Road Shop",
    addressLine1: "Yarm Road",
    addressLine2: null,
    city: "Stockton-on-Tees",
    postcode: "Not provided",
    propertyType: "commercial",
    bedrooms: null,
    currentMonthlyIncomeCents: 42_500,
    potentialMonthlyIncomeCents: 95_000,
    incomeBasis: "owner_share",
    ownershipStatus: "inferred",
    ownershipEffectiveFrom: SOURCE_SNAPSHOT_DATE,
    sourceReference: "Assets!A5:F5",
    notes: "Workbook source: Assets!A5:F5. Current monthly income is calculated as £850 ÷ 2, which supports a 50% economic-share inference. The co-owner is not named, and legal ownership remains to be confirmed.",
    owners: [
      { ...ZULFIQAR, ownershipPercentage: 50, isMainLandlord: true },
      unknownOwner("yarm-other", "Co-owner (identity pending)", 50),
    ],
  },
];

export interface SourceTransaction {
  propertyKey: SourceProperty["key"];
  sourceReference: string;
  direction: "income" | "expense";
  category: "rent" | "repairs" | "maintenance" | "insurance" | "certificates" | "agent_fees" | "utilities" | "other";
  amountCents: number;
  occurredOn: string;
  description: string;
  tenancyKey?: "noreen-575" | "noreen-850";
  rentPeriod?: string;
}

const brummyRent = (
  row: number,
  amountPounds: number,
  occurredOn: string,
  rentPeriod: string,
  comment: string,
  tenancyKey: "noreen-575" | "noreen-850",
): SourceTransaction => ({
  propertyKey: "birmingham",
  sourceReference: `Brummy 22-23-24!A${row}:I${row}`,
  direction: "income",
  category: "rent",
  amountCents: amountPounds * 100,
  occurredOn,
  description: `Noreen (Tenant) — ${comment}`,
  tenancyKey,
  rentPeriod,
});

export const SOURCE_TRANSACTIONS: SourceTransaction[] = [
  { propertyKey: "harehills", sourceReference: "Leeds Shop 22!A3:H3", direction: "expense", category: "utilities", amountCents: 183_500, occurredOn: "2022-01-01", description: "Zulfiqar paid monthly bills (comment: 4 years 2018 until 2022)" },
  { propertyKey: "harehills", sourceReference: "Leeds Shop 22!A4:H4", direction: "expense", category: "certificates", amountCents: 120_000, occurredOn: "2022-03-23", description: "Zulfiqar paid selective licensing" },
  { propertyKey: "harehills", sourceReference: "Leeds Shop 22!A5:H5", direction: "income", category: "other", amountCents: 780_000, occurredOn: "2022-03-10", description: "Shaheen Noor Foods — three months' shop rent (tenancy dates not complete in source)" },
  { propertyKey: "harehills", sourceReference: "Leeds Shop 22!A7:H7", direction: "expense", category: "agent_fees", amountCents: 266_200, occurredOn: "2022-02-02", description: "Tax returns paid in January 2022" },
  { propertyKey: "harehills", sourceReference: "Leeds Shop 22!A8:H8", direction: "expense", category: "repairs", amountCents: 120_000, occurredOn: "2022-04-01", description: "Roof repair" },
  { propertyKey: "harehills", sourceReference: "Leeds Shop 22!A9:H9", direction: "expense", category: "insurance", amountCents: 76_800, occurredOn: "2022-07-15", description: "Shop insurance" },
  { propertyKey: "harehills", sourceReference: "Leeds Shop 22!A10:H10", direction: "expense", category: "other", amountCents: 62_000, occurredOn: "2023-01-31", description: "Tax paid for 2021–2022" },
  { propertyKey: "harehills", sourceReference: "Leeds Shop 22!A11:H11", direction: "income", category: "other", amountCents: 540_000, occurredOn: "2022-12-31", description: "Flat 1 — Fezan — all rent for 2022 (no tenancy dates in source)" },
  { propertyKey: "harehills", sourceReference: "Leeds Shop 22!A12:H12", direction: "income", category: "other", amountCents: 200_000, occurredOn: "2022-05-31", description: "Flat 2 — Sher Khan — five months' rent (no tenancy dates in source)" },
  { propertyKey: "harehills", sourceReference: "Leeds Shop 22!A13:H13", direction: "income", category: "other", amountCents: 75_000, occurredOn: "2022-12-31", description: "Flat 2 — Sher Khan — three months' rent; source says three months still owed" },
  { propertyKey: "harehills", sourceReference: "Leeds Shop 22!A18:H18", direction: "income", category: "other", amountCents: 2_340_000, occurredOn: "2022-12-31", description: "Shaheen Noor Foods — nine months' shop rent (no tenancy dates in source)" },
  { propertyKey: "harehills", sourceReference: "Leeds Shop 22!A19:H19", direction: "expense", category: "maintenance", amountCents: 1_800_000, occurredOn: "2022-12-31", description: "Flat 1 refurbishment" },
  { propertyKey: "harehills", sourceReference: "Leeds Shop 22!A20:H20", direction: "expense", category: "maintenance", amountCents: 1_300_000, occurredOn: "2022-12-31", description: "Flat 2 refurbishment" },
  { propertyKey: "harehills", sourceReference: "Leeds Shop 22!A21:H21", direction: "expense", category: "maintenance", amountCents: 900_000, occurredOn: "2022-12-31", description: "Flat 3 refurbishment (description inferred from adjacent rows; source description is blank)" },
  { propertyKey: "harehills", sourceReference: "Leeds Shop 22!A22:H22", direction: "expense", category: "repairs", amountCents: 120_000, occurredOn: "2022-12-31", description: "Shop roof work — Carl" },
  { propertyKey: "harehills", sourceReference: "Leeds Shop 22!A23:H23", direction: "expense", category: "repairs", amountCents: 173_000, occurredOn: "2022-12-31", description: "Shop gutters and roof" },
  { propertyKey: "harehills", sourceReference: "Leeds Shop 22!A24:H24", direction: "expense", category: "repairs", amountCents: 14_000, occurredOn: "2022-12-31", description: "Flats electrical work — Adam" },
  { propertyKey: "harehills", sourceReference: "Leeds Shop 22!A25:H25", direction: "expense", category: "repairs", amountCents: 16_000, occurredOn: "2022-12-31", description: "Flats electrical work — Nelly" },

  brummyRent(3, 575, "2022-05-01", "2022-04-01", "one month rent — Apr 2022", "noreen-575"),
  brummyRent(4, 575, "2022-06-14", "2022-05-01", "one month rent — May 2022", "noreen-575"),
  brummyRent(5, 575, "2022-06-14", "2022-06-01", "one month rent — Jun 2022; separate same-day payment", "noreen-575"),
  brummyRent(6, 575, "2022-06-29", "2022-07-01", "one month rent — Jul 2022", "noreen-575"),
  brummyRent(7, 575, "2022-08-29", "2022-08-01", "one month rent — Aug 2022", "noreen-575"),
  brummyRent(8, 575, "2022-09-28", "2022-09-01", "one month rent — Sep 2022", "noreen-575"),
  brummyRent(9, 575, "2022-11-01", "2022-10-01", "one month rent — Oct 2022", "noreen-575"),
  brummyRent(10, 575, "2022-11-28", "2022-11-01", "one month rent — Nov 2022", "noreen-575"),
  brummyRent(11, 575, "2022-12-29", "2022-12-01", "one month rent — Dec 2022", "noreen-575"),
  brummyRent(12, 575, "2023-01-24", "2023-01-01", "one month rent — Jan 2023", "noreen-575"),
  brummyRent(13, 575, "2023-03-01", "2023-02-01", "one month rent — Feb 2023", "noreen-575"),
  brummyRent(14, 575, "2023-04-17", "2023-03-01", "one month rent — Mar 2023", "noreen-575"),
  brummyRent(15, 575, "2023-04-29", "2023-04-01", "one month rent — Apr 2023", "noreen-575"),
  brummyRent(16, 850, "2023-05-12", "2023-05-01", "one month rent — May 2023", "noreen-850"),
  brummyRent(17, 850, "2023-05-29", "2023-06-01", "one month rent — Jun 2023", "noreen-850"),
  brummyRent(18, 850, "2023-06-30", "2023-07-01", "one month rent — Jul 2023", "noreen-850"),
  brummyRent(19, 850, "2023-07-18", "2023-08-01", "one month rent — Aug 2023", "noreen-850"),
  brummyRent(20, 850, "2023-08-22", "2023-09-01", "one month rent — Sep 2023", "noreen-850"),
  brummyRent(21, 850, "2023-09-26", "2023-10-01", "one month rent — Oct 2023", "noreen-850"),
  brummyRent(22, 850, "2023-11-01", "2023-11-01", "one month rent — Nov 2023", "noreen-850"),
  brummyRent(23, 850, "2023-11-28", "2023-12-01", "one month rent — Dec 2023", "noreen-850"),
  { propertyKey: "birmingham", sourceReference: "Brummy 22-23-24!A26:I26", direction: "expense", category: "repairs", amountCents: 300_000, occurredOn: "2023-05-04", description: "Bathroom fix — plumber labour" },
  { propertyKey: "birmingham", sourceReference: "Brummy 22-23-24!A27:I27", direction: "expense", category: "repairs", amountCents: 100_000, occurredOn: "2023-05-01", description: "Bathroom fix — parts" },
  brummyRent(30, 850, "2023-12-22", "2024-01-01", "one month rent — Jan 2024", "noreen-850"),
  brummyRent(31, 850, "2024-02-01", "2024-02-01", "one month rent — Feb 2024", "noreen-850"),
  brummyRent(32, 850, "2024-02-29", "2024-03-01", "one month rent — Mar 2024", "noreen-850"),
  brummyRent(33, 850, "2024-03-30", "2024-04-01", "one month rent — Apr 2024", "noreen-850"),
  brummyRent(34, 850, "2024-04-29", "2024-05-01", "one month rent — May 2024", "noreen-850"),
  brummyRent(35, 850, "2024-05-30", "2024-06-01", "one month rent — Jun 2024", "noreen-850"),
  brummyRent(36, 850, "2024-07-02", "2024-07-01", "one month rent — Jul 2024", "noreen-850"),
  brummyRent(37, 850, "2024-07-30", "2024-08-01", "one month rent — Aug 2024", "noreen-850"),
  brummyRent(38, 450, "2024-08-29", "2024-09-01", "partial September rent; tenant paid plumber directly for bath work", "noreen-850"),
  brummyRent(39, 850, "2024-10-08", "2024-10-01", "one month rent — Oct 2024", "noreen-850"),
  { propertyKey: "birmingham", sourceReference: "Brummy 22-23-24!A40:I40", direction: "expense", category: "repairs", amountCents: 174_000, occurredOn: "2025-03-27", description: "Fencing — cash; receipt referenced on Abdullah WhatsApp" },
  { propertyKey: "birmingham", sourceReference: "Brummy 22-23-24!A41:I41", direction: "expense", category: "repairs", amountCents: 83_300, occurredOn: "2025-03-19", description: "Fencing — cash; receipt referenced on Abdullah WhatsApp" },
];

export const SOURCE_TOTALS = {
  currentMonthlyIncomeCents: SOURCE_PROPERTIES.reduce((sum, property) => sum + property.currentMonthlyIncomeCents, 0),
  potentialMonthlyIncomeCents: SOURCE_PROPERTIES.reduce((sum, property) => sum + property.potentialMonthlyIncomeCents, 0),
};

export const SOURCE_LEDGER_RECONCILIATION = {
  harehills: {
    workbookIncomeCents: 4_260_000,
    workbookExpenseCents: 5_436_500,
    importedDatedIncomeCents: 3_935_000,
    importedDatedExpenseCents: 5_151_500,
    excludedUndatedIncomeCents: 325_000,
    excludedUndatedExpenseCents: 285_000,
  },
  birmingham: {
    workbookIncomeCents: 2_237_500,
    workbookExpenseCents: 977_300,
    importedDatedIncomeCents: 2_237_500,
    importedDatedExpenseCents: 657_300,
    excludedUndatedIncomeCents: 0,
    excludedUndatedExpenseCents: 320_000,
  },
};
