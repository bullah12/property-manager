import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import {
  SOURCE_PROPERTIES,
  SOURCE_SNAPSHOT_DATE,
  SOURCE_TRANSACTIONS,
  SOURCE_WORKBOOK,
  SOURCE_WORKBOOK_SHA256,
} from "./source-data/rental-income-sample";
import { prisma, requireWorkspaceId, runInWorkspace } from "../src/lib/db";

const supabaseAdmin = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function deterministicUuid(key: string): string {
  const bytes = Buffer.from(createHash("sha256").update(`property-manager:${key}`).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function ensureAuthUser(email: string, password: string): Promise<string> {
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error) return created.user.id;

  const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  const existing = list.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  if (!existing) throw new Error(`Could not create or find auth user ${email}: ${error.message}`);
  return existing.id;
}

async function seedUserAndWorkspace() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin-password-123";
  const adminId = await ensureAuthUser(email, password);
  await prisma.user.upsert({
    where: { id: adminId },
    update: { email, displayName: "Zulfiqar Ali Taj", status: "active", role: "admin" },
    create: {
      id: adminId,
      email,
      displayName: "Zulfiqar Ali Taj",
      role: "admin",
      status: "active",
      timezone: "Europe/London",
    },
  });
  await prisma.userSettings.upsert({ where: { userId: adminId }, update: {}, create: { userId: adminId } });
  await prisma.workspace.upsert({
    where: { id: adminId },
    update: { name: "Property portfolio" },
    create: { id: adminId, name: "Property portfolio" },
  });
  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: adminId, userId: adminId } },
    update: { role: "owner", status: "active" },
    create: { workspaceId: adminId, userId: adminId, role: "owner", status: "active" },
  });
  return adminId;
}

async function archiveListingsOutsideWorkbook() {
  const result = await prisma.property.updateMany({
    where: { id: { notIn: SOURCE_PROPERTIES.map((property) => property.id) }, status: "active" },
    data: { status: "archived" },
  });
  console.log(`Archived ${result.count} listing(s) not present in ${SOURCE_WORKBOOK}.`);
}

async function seedPropertiesAndOwnership() {
  const workspaceId = requireWorkspaceId();
  for (const source of SOURCE_PROPERTIES) {
    const { owners, ownershipEffectiveFrom, sourceReference, key: _key, ...property } = source;
    void _key;
    await prisma.property.upsert({
      where: { id: property.id },
      update: { ...property, purchasePriceCents: null, status: "active" },
      create: { ...property, workspaceId, purchasePriceCents: null, status: "active" },
    });

    const allocations: Array<(typeof owners)[number] & { ownerId: string }> = [];
    for (const owner of owners) {
      const ownerId = deterministicUuid(`owner:${owner.key}`);
      await prisma.owner.upsert({
        where: { id: ownerId },
        update: { fullName: owner.fullName, address: owner.address },
        create: { id: ownerId, workspaceId, fullName: owner.fullName, address: owner.address },
      });
      allocations.push({ ownerId, ...owner });
    }

    const eventId = deterministicUuid(`source-opening:${source.id}:${SOURCE_WORKBOOK_SHA256}`);
    const existingEvent = await prisma.ownershipEvent.findUnique({ where: { id: eventId } });
    if (!existingEvent) {
      await prisma.$transaction(async (tx) => {
        await tx.ownershipEvent.create({
          data: {
            id: eventId,
            workspaceId,
            propertyId: source.id,
            eventType: "initial",
            effectiveDate: new Date(`${ownershipEffectiveFrom}T00:00:00Z`),
            beforeSnapshot: [],
            afterSnapshot: allocations.map((allocation) => ({
              ownerId: allocation.ownerId,
              fullName: allocation.fullName,
              ownershipPercentage: allocation.ownershipPercentage,
              isMainLandlord: allocation.isMainLandlord,
            })),
            reason: `${source.ownershipStatus === "pending" ? "Technical opening allocation" : "Source-derived opening allocation"} from ${sourceReference}`,
            notes: `${source.notes} Imported from ${SOURCE_WORKBOOK} (SHA-256 ${SOURCE_WORKBOOK_SHA256}).`,
          },
        });
        await tx.ownershipEventAllocation.createMany({
          data: allocations.map((allocation) => ({
            workspaceId,
            eventId,
            ownerId: allocation.ownerId,
            ownershipPercentage: allocation.ownershipPercentage,
            isMainLandlord: allocation.isMainLandlord,
          })),
        });
      });
    }

    const noteId = deterministicUuid(`source-note:${source.id}:${SOURCE_WORKBOOK_SHA256}`);
    const existingNote = await prisma.ownershipNote.findUnique({ where: { id: noteId } });
    if (!existingNote) {
      await prisma.ownershipNote.create({
        data: {
          id: noteId,
          workspaceId,
          propertyId: source.id,
          eventId,
          title: "Workbook ownership evidence",
          noteText: `${source.notes}\n\nSource reference: ${sourceReference}\nWorkbook SHA-256: ${SOURCE_WORKBOOK_SHA256}`,
          noteDate: new Date(`${SOURCE_SNAPSHOT_DATE}T00:00:00Z`),
          sensitivity: "workspace",
        },
      });
    }
  }
}

async function seedBirminghamTenancies() {
  const workspaceId = requireWorkspaceId();
  const property = SOURCE_PROPERTIES.find((row) => row.key === "birmingham");
  if (!property) throw new Error("Birmingham source property is missing");
  const tenantId = deterministicUuid("tenant:noreen:brummy-ledger");
  await prisma.tenant.upsert({
    where: { id: tenantId },
    update: { fullName: "Noreen", notes: "Named as Noreen (Tenant) in Brummy 22-23-24." },
    create: { id: tenantId, workspaceId, fullName: "Noreen", notes: "Named as Noreen (Tenant) in Brummy 22-23-24." },
  });
  const tenancies = [
    { key: "noreen-575", startDate: "2022-04-01", endDate: "2023-04-30", rentAmountCents: 57_500, status: "renewed" },
    { key: "noreen-850", startDate: "2023-05-01", endDate: "2024-10-31", rentAmountCents: 85_000, status: "ended" },
  ] as const;
  for (const tenancy of tenancies) {
    const id = deterministicUuid(`tenancy:${tenancy.key}`);
    await prisma.tenancy.upsert({
      where: { id },
      update: {
        propertyId: property.id,
        tenantId,
        startDate: new Date(`${tenancy.startDate}T00:00:00Z`),
        endDate: new Date(`${tenancy.endDate}T00:00:00Z`),
        endedOn: tenancy.status === "ended" ? new Date(`${tenancy.endDate}T00:00:00Z`) : null,
        rentAmountCents: tenancy.rentAmountCents,
        rentDueDay: 1,
        status: tenancy.status,
      },
      create: {
        id,
        workspaceId,
        propertyId: property.id,
        tenantId,
        startDate: new Date(`${tenancy.startDate}T00:00:00Z`),
        endDate: new Date(`${tenancy.endDate}T00:00:00Z`),
        endedOn: tenancy.status === "ended" ? new Date(`${tenancy.endDate}T00:00:00Z`) : null,
        rentAmountCents: tenancy.rentAmountCents,
        rentDueDay: 1,
        status: tenancy.status,
      },
    });
  }
}

async function seedTransactions() {
  const workspaceId = requireWorkspaceId();
  const propertyIds = Object.fromEntries(SOURCE_PROPERTIES.map((property) => [property.key, property.id]));
  for (const source of SOURCE_TRANSACTIONS) {
    const id = deterministicUuid(`transaction:${source.sourceReference}:${source.direction}:${source.amountCents}`);
    const tenancyId = source.tenancyKey ? deterministicUuid(`tenancy:${source.tenancyKey}`) : null;
    const data = {
      workspaceId,
      propertyId: propertyIds[source.propertyKey],
      tenancyId,
      direction: source.direction,
      category: source.category,
      amountCents: source.amountCents,
      occurredOn: new Date(`${source.occurredOn}T00:00:00Z`),
      rentPeriod: source.rentPeriod ? new Date(`${source.rentPeriod}T00:00:00Z`) : null,
      description: `${source.description} [Source: ${source.sourceReference}]`,
    };
    await prisma.transaction.upsert({ where: { id }, update: data, create: { id, ...data } });
  }
  console.log(`Seeded ${SOURCE_PROPERTIES.length} source properties and ${SOURCE_TRANSACTIONS.length} dated ledger rows.`);
}

async function main() {
  const adminId = await seedUserAndWorkspace();
  await runInWorkspace(adminId, async () => {
    await archiveListingsOutsideWorkbook();
    await seedPropertiesAndOwnership();
    await seedBirminghamTenancies();
    await seedTransactions();
  });
  console.log(`Source-of-truth refresh complete from ${SOURCE_WORKBOOK}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
