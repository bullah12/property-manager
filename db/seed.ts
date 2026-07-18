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

async function main() {
  await seedUsers();
  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
