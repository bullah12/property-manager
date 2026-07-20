/**
 * Seed script (PLAN.md §3 seed spec; grows phase by phase).
 * Idempotent: safe to re-run against an existing local database.
 *
 * Phase 1: admin user (+settings) able to log in, plus a suspended user to
 * exercise the requireAuth status check.
 */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { prisma, requireWorkspaceId, runInWorkspace } from "../src/lib/db";

const supabaseAdmin = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

/** Create (or find) a Supabase auth user and return its id. */
async function ensureAuthUser(email: string, password: string): Promise<string> {
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error) return created.user.id;

  // Already exists → find it (small local user set; paging not needed).
  const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;
  const existing = list.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );
  if (!existing) throw new Error(`Could not create or find auth user ${email}: ${error.message}`);
  return existing.id;
}

async function seedUsers() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin-password-123";

  const adminId = await ensureAuthUser(adminEmail, adminPassword);
  await prisma.user.upsert({
    where: { id: adminId },
    update: { email: adminEmail, status: "active", role: "admin" },
    create: {
      id: adminId,
      email: adminEmail,
      displayName: "Alex Landlord",
      role: "admin",
      status: "active",
      timezone: "Europe/London",
    },
  });
  await prisma.userSettings.upsert({
    where: { userId: adminId },
    update: {},
    create: { userId: adminId },
  });
  await prisma.workspace.upsert({
    where: { id: adminId },
    update: {},
    create: { id: adminId, name: "Alex Landlord's portfolio" },
  });
  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: adminId, userId: adminId } },
    update: { role: "owner", status: "active" },
    create: { workspaceId: adminId, userId: adminId, role: "owner" },
  });
  console.log(`Seeded admin ${adminEmail} (${adminId})`);

  // Suspended user: valid Supabase session possible, but requireAuth rejects.
  const suspendedEmail = "suspended@example.com";
  const suspendedId = await ensureAuthUser(suspendedEmail, "suspended-password-123");
  await prisma.user.upsert({
    where: { id: suspendedId },
    update: { status: "suspended" },
    create: {
      id: suspendedId,
      email: suspendedEmail,
      displayName: "Sam Suspended",
      role: "admin",
      status: "suspended",
      timezone: "Europe/London",
    },
  });
  await prisma.userSettings.upsert({
    where: { userId: suspendedId },
    update: {},
    create: { userId: suspendedId },
  });
  await prisma.workspace.upsert({
    where: { id: suspendedId },
    update: {},
    create: { id: suspendedId, name: "Sam Suspended's portfolio" },
  });
  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: suspendedId, userId: suspendedId } },
    update: { role: "owner", status: "active" },
    create: { workspaceId: suspendedId, userId: suspendedId, role: "owner" },
  });
  console.log(`Seeded suspended user ${suspendedEmail} (${suspendedId})`);

  return { adminId };
}

// Fixed ids keep the seed idempotent and give the proof log stable handles.
export const SEED_IDS = {
  houseProperty: "11111111-1111-4111-8111-111111111101",
  flatProperty: "11111111-1111-4111-8111-111111111102",
  archivedProperty: "11111111-1111-4111-8111-111111111103",
  tenantTom: "22222222-2222-4222-8222-222222222201",
  tenantPriya: "22222222-2222-4222-8222-222222222202",
  tenantMarcus: "22222222-2222-4222-8222-222222222203",
  tenantElena: "22222222-2222-4222-8222-222222222204",
  tenancyMapleRenewed: "33333333-3333-4333-8333-333333333301",
  tenancyMapleActive: "33333333-3333-4333-8333-333333333302",
  tenancyQuayEnded: "33333333-3333-4333-8333-333333333303",
  tenancyQuayDraft: "33333333-3333-4333-8333-333333333304",
  tenancyMillEnded: "33333333-3333-4333-8333-333333333305",
  fileMapleSigned: "44444444-4444-4444-8444-444444444401",
  fileMapleOld: "44444444-4444-4444-8444-444444444402",
  fileQuayDraft: "44444444-4444-4444-8444-444444444403",
  fileQuayEnded: "44444444-4444-4444-8444-444444444404",
  contractMapleSigned: "55555555-5555-4555-8555-555555555501",
  contractMapleSuperseded: "55555555-5555-4555-8555-555555555502",
  contractQuayDraft: "55555555-5555-4555-8555-555555555503",
  contractQuayIssued: "55555555-5555-4555-8555-555555555504",
  fileReceiptBoiler: "44444444-4444-4444-8444-444444444405",
  fileGasCert: "44444444-4444-4444-8444-444444444406",
  complianceGasOverdue: "88888888-8888-4888-8888-888888888801",
  complianceEicrSoon: "88888888-8888-4888-8888-888888888802",
  complianceEpcFuture: "88888888-8888-4888-8888-888888888803",
  complianceSmokeDone: "88888888-8888-4888-8888-888888888804",
};

async function seedProperties() {
  const properties = [
    {
      id: SEED_IDS.houseProperty,
      nickname: "Maple House",
      addressLine1: "14 Maple Grove",
      addressLine2: null,
      city: "Leeds",
      postcode: "LS6 2AB",
      propertyType: "house",
      bedrooms: 3,
      purchasePriceCents: 24500000,
      notes: "Semi-detached; boiler serviced annually.",
      status: "active",
    },
    {
      id: SEED_IDS.flatProperty,
      nickname: "Quay Flat",
      addressLine1: "Flat 12, Harbour Quay",
      addressLine2: "3 Dockside Road",
      city: "Bristol",
      postcode: "BS1 4RT",
      propertyType: "flat",
      bedrooms: 2,
      purchasePriceCents: 19800000,
      notes: null,
      status: "active",
    },
    {
      id: SEED_IDS.archivedProperty,
      nickname: "Old Mill Cottage",
      addressLine1: "2 Mill Lane",
      addressLine2: null,
      city: "York",
      postcode: "YO1 7HZ",
      propertyType: "house",
      bedrooms: 2,
      purchasePriceCents: null,
      notes: "Sold in 2024 — kept for records.",
      status: "archived",
    },
  ];
  for (const p of properties) {
    const { id, ...data } = p;
    await prisma.property.upsert({
      where: { id },
      update: data,
      create: { id, workspaceId: requireWorkspaceId(), ...data },
    });
  }
  console.log(`Seeded ${properties.length} properties`);
}

async function seedTenantsAndTenancies() {
  const tenants = [
    {
      id: SEED_IDS.tenantTom,
      fullName: "Tom Field",
      email: "tom.field@example.com",
      phone: "+44 7700 900101",
      notes: null,
    },
    {
      id: SEED_IDS.tenantPriya,
      fullName: "Priya Shah",
      email: "priya.shah@example.com",
      phone: "+44 7700 900102",
      notes: "Prefers email contact.",
    },
    {
      id: SEED_IDS.tenantMarcus,
      fullName: "Marcus Webb",
      email: "marcus.webb@example.com",
      phone: null,
      notes: "Rented two properties over the years.",
    },
    {
      id: SEED_IDS.tenantElena,
      fullName: "Elena Novak",
      email: null,
      phone: "+44 7700 900104",
      notes: "Prospective tenant — viewing booked.",
    },
  ];
  for (const t of tenants) {
    const { id, ...data } = t;
    await prisma.tenant.upsert({
      where: { id },
      update: data,
      create: { id, workspaceId: requireWorkspaceId(), ...data },
    });
  }

  // Tenancies covering all four states (PLAN.md §3 seed spec):
  // - Maple House: renewed → active chain for Tom Field.
  // - Quay Flat: ended (Marcus) then a draft (Priya) starting soon.
  // - Old Mill Cottage: ended (Marcus again — same tenant, two properties).
  const tenancies = [
    {
      id: SEED_IDS.tenancyMapleRenewed,
      propertyId: SEED_IDS.houseProperty,
      tenantId: SEED_IDS.tenantTom,
      startDate: new Date("2023-09-01T00:00:00Z"),
      endDate: new Date("2024-08-31T00:00:00Z"),
      endedOn: null,
      rentAmountCents: 90000,
      rentDueDay: 1,
      depositAmountCents: 103800,
      depositScheme: "DPS (custodial)",
      depositReference: "DPS-10293847",
      status: "renewed",
    },
    {
      id: SEED_IDS.tenancyMapleActive,
      propertyId: SEED_IDS.houseProperty,
      tenantId: SEED_IDS.tenantTom,
      startDate: new Date("2024-09-01T00:00:00Z"),
      endDate: new Date("2026-08-31T00:00:00Z"),
      endedOn: null,
      rentAmountCents: 95000,
      rentDueDay: 1,
      depositAmountCents: 109500,
      depositScheme: "DPS (custodial)",
      depositReference: "DPS-10293847",
      status: "active",
    },
    {
      id: SEED_IDS.tenancyQuayEnded,
      propertyId: SEED_IDS.flatProperty,
      tenantId: SEED_IDS.tenantMarcus,
      startDate: new Date("2024-02-01T00:00:00Z"),
      endDate: new Date("2026-01-31T00:00:00Z"),
      endedOn: new Date("2026-01-31T00:00:00Z"),
      rentAmountCents: 115000,
      rentDueDay: 15,
      depositAmountCents: 132600,
      depositScheme: "TDS (insured)",
      depositReference: "TDS-55201",
      status: "ended",
    },
    {
      id: SEED_IDS.tenancyQuayDraft,
      propertyId: SEED_IDS.flatProperty,
      tenantId: SEED_IDS.tenantPriya,
      startDate: new Date("2026-08-01T00:00:00Z"),
      endDate: new Date("2027-07-31T00:00:00Z"),
      endedOn: null,
      rentAmountCents: 125000,
      rentDueDay: 5,
      depositAmountCents: 144200,
      depositScheme: "mydeposits (custodial)",
      depositReference: "MYD-88104",
      status: "draft",
    },
    {
      id: SEED_IDS.tenancyMillEnded,
      propertyId: SEED_IDS.archivedProperty,
      tenantId: SEED_IDS.tenantMarcus,
      startDate: new Date("2022-03-01T00:00:00Z"),
      endDate: new Date("2023-02-28T00:00:00Z"),
      endedOn: new Date("2023-02-28T00:00:00Z"),
      rentAmountCents: 75000,
      rentDueDay: 1,
      depositAmountCents: null,
      depositScheme: null,
      depositReference: null,
      status: "ended",
    },
  ];
  for (const t of tenancies) {
    const { id, ...data } = t;
    await prisma.tenancy.upsert({
      where: { id },
      update: data,
      create: { id, workspaceId: requireWorkspaceId(), ...data },
    });
  }
  console.log(`Seeded ${tenants.length} tenants, ${tenancies.length} tenancies`);
}

/** Tiny but valid single-page PDF, so downloads open in a viewer. */
function makePdf(title: string): Buffer {
  const text = title.replace(/[()\\]/g, "");
  const content = `BT /F1 18 Tf 72 760 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xrefStart = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

const STORAGE_BUCKET = "files";

async function ensureBucket() {
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
  if (error) throw new Error(`listBuckets failed: ${error.message}`);
  if (!buckets.some((b) => b.name === STORAGE_BUCKET)) {
    const { error: e } = await supabaseAdmin.storage.createBucket(STORAGE_BUCKET, {
      public: false,
    });
    if (e) throw new Error(`createBucket failed: ${e.message}`);
  }
}

async function seedFileAndContract(opts: {
  fileId: string;
  contractId: string;
  tenancyId: string;
  ownerId: string;
  kind: string;
  status: "draft" | "issued" | "signed" | "superseded";
  signedOn?: string;
  title: string;
  name: string;
}) {
  const pdf = makePdf(opts.title);
  const storageKey = `lease-doc/${opts.fileId}/${opts.name}`;
  const { error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(storageKey, pdf, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`seed upload failed: ${error.message}`);

  const checksum = createHash("sha256").update(pdf).digest("hex");
  await prisma.file.upsert({
    where: { id: opts.fileId },
    update: { status: "ready" },
    create: {
      id: opts.fileId,
      workspaceId: requireWorkspaceId(),
      ownerId: opts.ownerId,
      purpose: "lease-doc",
      storageKey,
      contentType: "application/pdf",
      sizeBytes: BigInt(pdf.length),
      checksumSha256: checksum,
      isPublic: false,
      status: "ready",
    },
  });
  await prisma.contract.upsert({
    where: { id: opts.contractId },
    update: { status: opts.status },
    create: {
      id: opts.contractId,
      workspaceId: requireWorkspaceId(),
      tenancyId: opts.tenancyId,
      kind: opts.kind,
      source: "uploaded",
      fileId: opts.fileId,
      status: opts.status,
      signedOn: opts.signedOn ? new Date(`${opts.signedOn}T00:00:00Z`) : null,
    },
  });
}

async function seedContracts(adminId: string) {
  await ensureBucket();
  await seedFileAndContract({
    fileId: SEED_IDS.fileMapleSigned,
    contractId: SEED_IDS.contractMapleSigned,
    tenancyId: SEED_IDS.tenancyMapleActive,
    ownerId: adminId,
    kind: "lease",
    status: "signed",
    signedOn: "2024-08-20",
    title: "AST Lease - Maple House - Tom Field (signed 2024)",
    name: "maple-house-lease-2024.pdf",
  });
  await seedFileAndContract({
    fileId: SEED_IDS.fileMapleOld,
    contractId: SEED_IDS.contractMapleSuperseded,
    tenancyId: SEED_IDS.tenancyMapleRenewed,
    ownerId: adminId,
    kind: "lease",
    status: "superseded",
    signedOn: "2023-08-25",
    title: "AST Lease - Maple House - Tom Field (superseded 2023)",
    name: "maple-house-lease-2023.pdf",
  });
  await seedFileAndContract({
    fileId: SEED_IDS.fileQuayDraft,
    contractId: SEED_IDS.contractQuayDraft,
    tenancyId: SEED_IDS.tenancyQuayDraft,
    ownerId: adminId,
    kind: "lease",
    status: "draft",
    title: "AST Lease - Quay Flat - Priya Shah (draft)",
    name: "quay-flat-lease-2026-draft.pdf",
  });
  await seedFileAndContract({
    fileId: SEED_IDS.fileQuayEnded,
    contractId: SEED_IDS.contractQuayIssued,
    tenancyId: SEED_IDS.tenancyQuayEnded,
    ownerId: adminId,
    kind: "lease",
    status: "issued",
    title: "AST Lease - Quay Flat - Marcus Webb (issued 2024)",
    name: "quay-flat-lease-2024.pdf",
  });
  console.log("Seeded 4 files + 4 contracts (draft/issued/signed/superseded)");
}

async function seedExpenses(adminId: string) {
  // One receipt file in storage, attached to the boiler repair.
  const receiptPdf = makePdf("Receipt - PlumbCo boiler repair - 180.00 GBP");
  const receiptKey = `receipt/${SEED_IDS.fileReceiptBoiler}/plumbco-boiler-receipt.pdf`;
  const { error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(receiptKey, receiptPdf, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`receipt upload failed: ${error.message}`);
  await prisma.file.upsert({
    where: { id: SEED_IDS.fileReceiptBoiler },
    update: { status: "ready" },
    create: {
      id: SEED_IDS.fileReceiptBoiler,
      workspaceId: requireWorkspaceId(),
      ownerId: adminId,
      purpose: "receipt",
      storageKey: receiptKey,
      contentType: "application/pdf",
      sizeBytes: BigInt(receiptPdf.length),
      checksumSha256: createHash("sha256").update(receiptPdf).digest("hex"),
      isPublic: false,
      status: "ready",
    },
  });

  const maple = SEED_IDS.houseProperty;
  const quay = SEED_IDS.flatProperty;
  // Two calendar years (2025 + 2026), every expense category covered.
  const expenses: Array<
    [string, string, string, number, string, string | null]
  > = [
    // [id-suffix, propertyId, category, cents, date, description]
    ["01", maple, "repairs", 18000, "2025-02-14", "PlumbCo — boiler repair"],
    ["02", maple, "maintenance", 6500, "2025-04-03", "Gutter clearing"],
    ["03", maple, "insurance", 32400, "2025-01-09", "Landlord insurance premium 2025"],
    ["04", maple, "mortgage_interest", 41250, "2025-03-31", "Q1 2025 mortgage interest"],
    ["05", maple, "certificates", 8500, "2025-05-20", "Gas safety certificate renewal"],
    ["06", maple, "agent_fees", 11400, "2025-07-01", "Letting agent quarterly fee"],
    ["07", maple, "utilities", 5600, "2025-08-12", "Void-period electricity"],
    ["08", maple, "other", 4200, "2025-10-05", "Key cutting + lock change"],
    ["09", quay, "repairs", 22000, "2025-06-18", "Washing machine replacement drum"],
    ["10", quay, "insurance", 28900, "2025-01-15", "Landlord insurance premium 2025"],
    ["11", quay, "mortgage_interest", 38700, "2025-06-30", "H1 2025 mortgage interest"],
    ["12", quay, "agent_fees", 13200, "2025-09-30", "Letting agent quarterly fee"],
    ["13", maple, "insurance", 33900, "2026-01-08", "Landlord insurance premium 2026"],
    ["14", maple, "repairs", 18000, "2026-02-11", "PlumbCo — boiler repair (receipt)"],
    ["15", maple, "maintenance", 7200, "2026-03-22", "Garden fence panel replacement"],
    ["16", maple, "mortgage_interest", 40800, "2026-03-31", "Q1 2026 mortgage interest"],
    ["17", maple, "certificates", 9200, "2026-05-28", "EICR electrical inspection"],
    ["18", maple, "utilities", 4900, "2026-06-15", "Water rates adjustment"],
    ["19", quay, "repairs", 9800, "2026-04-09", "Extractor fan replacement"],
    ["20", quay, "maintenance", 15500, "2026-05-02", "Repaint hallway between tenancies"],
    ["21", quay, "insurance", 30100, "2026-01-20", "Landlord insurance premium 2026"],
    ["22", quay, "agent_fees", 13800, "2026-06-30", "Letting agent quarterly fee"],
    ["23", quay, "other", 3500, "2026-07-01", "Replacement fobs for communal door"],
    ["24", quay, "mortgage_interest", 37900, "2026-06-30", "H1 2026 mortgage interest"],
  ];

  for (const [suffix, propertyId, category, amountCents, date, description] of expenses) {
    const id = `66666666-6666-4666-8666-6666666666${suffix}`;
    await prisma.transaction.upsert({
      where: { id },
      update: {},
      create: {
        id,
        workspaceId: requireWorkspaceId(),
        propertyId,
        direction: "expense",
        category,
        amountCents,
        occurredOn: new Date(`${date}T00:00:00Z`),
        description,
        receiptFileId: suffix === "14" ? SEED_IDS.fileReceiptBoiler : null,
      },
    });
  }
  console.log(`Seeded ${expenses.length} expense transactions (2025–2026, all categories)`);
}

async function seedRentPayments() {
  // Rent rows making the 2026 Maple House grid read (against a mid-July 2026
  // "today"): Jan–Apr paid, May PARTIAL (£450 of £950), Jun OVERDUE (nothing
  // received), Jul PAID. 2025 fully paid for chart depth. Quay Flat's ended
  // tenancy gets its last few months so past-year grids have data.
  const rows: Array<{
    id: string;
    propertyId: string;
    tenancyId: string;
    amountCents: number;
    occurredOn: string;
    rentPeriod: string;
    description?: string;
  }> = [];

  const maple = { propertyId: SEED_IDS.houseProperty, tenancyId: SEED_IDS.tenancyMapleActive };
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, "0");
    rows.push({
      id: `77777777-7777-4777-8777-2025${mm}000001`,
      ...maple,
      amountCents: 95000,
      occurredOn: `2025-${mm}-01`,
      rentPeriod: `2025-${mm}-01`,
    });
  }
  for (const mm of ["01", "02", "03", "04"]) {
    rows.push({
      id: `77777777-7777-4777-8777-2026${mm}000001`,
      ...maple,
      amountCents: 95000,
      occurredOn: `2026-${mm}-01`,
      rentPeriod: `2026-${mm}-01`,
    });
  }
  rows.push({
    id: "77777777-7777-4777-8777-202605000001",
    ...maple,
    amountCents: 45000,
    occurredOn: "2026-05-03",
    rentPeriod: "2026-05-01",
    description: "Part payment — tenant covering rest next week",
  });
  // June 2026: intentionally no payment → OVERDUE.
  rows.push({
    id: "77777777-7777-4777-8777-202607000001",
    ...maple,
    amountCents: 95000,
    occurredOn: "2026-07-01",
    rentPeriod: "2026-07-01",
  });

  const quay = { propertyId: SEED_IDS.flatProperty, tenancyId: SEED_IDS.tenancyQuayEnded };
  for (const [mm, yyyy] of [
    ["10", "2025"],
    ["11", "2025"],
    ["12", "2025"],
    ["01", "2026"],
  ] as const) {
    rows.push({
      id: `77777777-7777-4777-8777-${yyyy}${mm}000002`,
      ...quay,
      amountCents: 115000,
      occurredOn: `${yyyy}-${mm}-15`,
      rentPeriod: `${yyyy}-${mm}-01`,
    });
  }

  for (const r of rows) {
    const { id, occurredOn, rentPeriod, ...data } = r;
    await prisma.transaction.upsert({
      where: { id },
      update: {},
      create: {
        id,
        workspaceId: requireWorkspaceId(),
        ...data,
        direction: "income",
        category: "rent",
        occurredOn: new Date(`${occurredOn}T00:00:00Z`),
        rentPeriod: new Date(`${rentPeriod}T00:00:00Z`),
      },
    });
  }
  console.log(`Seeded ${rows.length} rent payments (paid/partial/overdue months)`);
}

async function seedComplianceAndReminders(adminId: string) {
  // Attach last year's gas certificate scan to the overdue item.
  const certPdf = makePdf("Gas Safety Record - Maple House - 2025");
  const certKey = `certificate/${SEED_IDS.fileGasCert}/maple-gas-cert-2025.pdf`;
  const { error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(certKey, certPdf, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`cert upload failed: ${error.message}`);
  await prisma.file.upsert({
    where: { id: SEED_IDS.fileGasCert },
    update: { status: "ready" },
    create: {
      id: SEED_IDS.fileGasCert,
      workspaceId: requireWorkspaceId(),
      ownerId: adminId,
      purpose: "certificate",
      storageKey: certKey,
      contentType: "application/pdf",
      sizeBytes: BigInt(certPdf.length),
      checksumSha256: createHash("sha256").update(certPdf).digest("hex"),
      isPublic: false,
      status: "ready",
    },
  });

  // PLAN.md §3 seed spec: one overdue, one due ≤30d, one comfortably future,
  // one completed (dates relative to a mid-July 2026 "today").
  const items = [
    {
      id: SEED_IDS.complianceGasOverdue,
      propertyId: SEED_IDS.houseProperty,
      kind: "gas_certificate",
      label: "Gas certificate",
      dueOn: "2026-06-20", // overdue
      completedOn: null as string | null,
      documentFileId: SEED_IDS.fileGasCert,
      recurrenceMonths: 12,
    },
    {
      id: SEED_IDS.complianceEicrSoon,
      propertyId: SEED_IDS.houseProperty,
      kind: "electrical_eicr",
      label: "Electrical EICR",
      dueOn: "2026-08-05", // due within 30 days
      completedOn: null,
      documentFileId: null,
      recurrenceMonths: 60,
    },
    {
      id: SEED_IDS.complianceEpcFuture,
      propertyId: SEED_IDS.flatProperty,
      kind: "epc",
      label: "EPC",
      dueOn: "2028-09-30", // comfortably future
      completedOn: null,
      documentFileId: null,
      recurrenceMonths: 120,
    },
    {
      id: SEED_IDS.complianceSmokeDone,
      propertyId: SEED_IDS.flatProperty,
      kind: "smoke_co_check",
      label: "Smoke & CO alarm check",
      dueOn: "2026-05-01",
      completedOn: "2026-05-01", // completed one-off
      documentFileId: null,
      recurrenceMonths: null,
    },
  ];
  for (const item of items) {
    const { id, dueOn, completedOn, ...data } = item;
    await prisma.complianceItem.upsert({
      where: { id },
      update: {
        dueOn: new Date(`${dueOn}T00:00:00Z`),
        completedOn: completedOn ? new Date(`${completedOn}T00:00:00Z`) : null,
      },
      create: {
        id,
        workspaceId: requireWorkspaceId(),
        ...data,
        dueOn: new Date(`${dueOn}T00:00:00Z`),
        completedOn: completedOn ? new Date(`${completedOn}T00:00:00Z`) : null,
      },
    });
  }

  // Matching reminders (§5.2): open compliance items + draft/active tenancies
  // (lease-expiry backfill for the seed tenancies).
  const reminderTargets: Array<["compliance_item" | "tenancy", string, string]> = [
    ["compliance_item", SEED_IDS.complianceGasOverdue, "2026-06-20"],
    ["compliance_item", SEED_IDS.complianceEicrSoon, "2026-08-05"],
    ["compliance_item", SEED_IDS.complianceEpcFuture, "2028-09-30"],
    ["tenancy", SEED_IDS.tenancyMapleActive, "2026-08-31"],
    ["tenancy", SEED_IDS.tenancyQuayDraft, "2027-07-31"],
  ];
  for (const [subjectType, subjectId, dueOn] of reminderTargets) {
    await prisma.reminder.upsert({
      where: { subjectType_subjectId: { subjectType, subjectId } },
      update: { dueOn: new Date(`${dueOn}T00:00:00Z`) },
      create: {
        workspaceId: requireWorkspaceId(),
        subjectType,
        subjectId,
        dueOn: new Date(`${dueOn}T00:00:00Z`),
        leadDays: [60, 30, 7],
      },
    });
  }
  // Completed/ended subjects must not have reminder rows.
  await prisma.reminder.deleteMany({
    where: {
      OR: [
        { subjectType: "compliance_item", subjectId: SEED_IDS.complianceSmokeDone },
        {
          subjectType: "tenancy",
          subjectId: {
            in: [
              SEED_IDS.tenancyMapleRenewed,
              SEED_IDS.tenancyQuayEnded,
              SEED_IDS.tenancyMillEnded,
            ],
          },
        },
      ],
    },
  });
  console.log(`Seeded ${items.length} compliance items + ${reminderTargets.length} reminders`);
}

async function seedNotificationsAndJobs(adminId: string) {
  // A handful of notifications (read + unread) so the inbox has content
  // before the first scan, and one dead job for dead-letter visibility.
  const notifications = [
    {
      id: "99999999-9999-4999-8999-999999999901",
      type: "cert.expiring",
      title: "Gas certificate due in 30 days at Maple House",
      body: "Gas certificate for Maple House is due on 2026-06-20.",
      linkPath: `/properties/${SEED_IDS.houseProperty}?tab=notifications`,
      dedupeKey: "cert.expiring:seed:30",
      readAt: new Date("2026-05-22T09:15:00Z"),
      createdAt: new Date("2026-05-21T08:00:00Z"),
    },
    {
      id: "99999999-9999-4999-8999-999999999902",
      type: "lease.expiring",
      title: "Tenancy ends in 60 days at Maple House",
      body: "Tom Field's tenancy at Maple House ends on 2026-08-31. Renew or plan the changeover.",
      linkPath: `/properties/${SEED_IDS.houseProperty}?tab=tenancy`,
      dedupeKey: "lease.expiring:seed:60",
      readAt: null,
      createdAt: new Date("2026-07-02T08:00:00Z"),
    },
  ];
  for (const n of notifications) {
    const { id, ...data } = n;
    await prisma.notification.upsert({
      where: { id },
      update: {},
      create: { id, workspaceId: requireWorkspaceId(), userId: adminId, ...data },
    });
  }

  await prisma.job.upsert({
    where: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01" },
    update: {},
    create: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01",
      workspaceId: requireWorkspaceId(),
      type: "email.send",
      payload: { notificationId: "99999999-9999-4999-8999-999999999901" },
      status: "dead",
      attempts: 3,
      maxAttempts: 3,
      lastError: "Seeded example: SMTP connection refused (dead-letter demo)",
    },
  });
  console.log("Seeded 2 notifications (1 read, 1 unread) + 1 dead job");
}

async function main() {
  const { adminId } = await seedUsers();
  await runInWorkspace(adminId, async () => {
    await seedProperties();
    await seedTenantsAndTenancies();
    await seedContracts(adminId);
    await seedExpenses(adminId);
    await seedRentPayments();
    await seedComplianceAndReminders(adminId);
    await seedNotificationsAndJobs(adminId);
  });
  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
