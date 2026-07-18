/**
 * Seed script (PLAN.md §3 seed spec; grows phase by phase).
 * Idempotent: safe to re-run against an existing local database.
 *
 * Phase 1: admin user (+settings) able to log in, plus a suspended user to
 * exercise the requireAuth status check.
 */
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const prisma = new PrismaClient();

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
    await prisma.property.upsert({ where: { id }, update: data, create: { id, ...data } });
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
    await prisma.tenant.upsert({ where: { id }, update: data, create: { id, ...data } });
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
    await prisma.tenancy.upsert({ where: { id }, update: data, create: { id, ...data } });
  }
  console.log(`Seeded ${tenants.length} tenants, ${tenancies.length} tenancies`);
}

async function main() {
  await seedUsers();
  await seedProperties();
  await seedTenantsAndTenancies();
  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
