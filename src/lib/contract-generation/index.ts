import { createHash, randomUUID } from "node:crypto";
import type { Job, Prisma } from "@prisma/client";
import { conflict, notFound } from "@/lib/api/errors";
import { prisma, requireWorkspaceId } from "@/lib/db";
import { enqueueJob, registerJobHandler } from "@/lib/jobs";
import { getOwner, notify } from "@/lib/notify";
import { findMainLandlord } from "@/lib/property-ownership";
import { uploadToStorage } from "@/lib/storage";
import { buildGeneratedLeaseFilename } from "./filename";
import { renderLeasePdf } from "./render";
import { buildLeaseViewModel, TEMPLATE_VERSION, type ClauseInput } from "./view-model";

/**
 * §5.4 contract-generation pipeline. Generation runs in a background job for
 * durable document creation and storage retries; signed/issued documents are
 * never regenerated in place — a new contract row supersedes.
 */

export interface GeneratePayload {
  tenancyId: string;
  kind: "lease";
  clauses: ClauseInput;
  requestedByUserId?: string;
}

/** Route-side validation + enqueue → 202 (PLAN.md §6). */
export async function requestContractGeneration(payload: GeneratePayload): Promise<Job> {
  const tenancy = await prisma.tenancy.findUnique({ where: { id: payload.tenancyId } });
  if (!tenancy) throw notFound("Tenancy");

  const existing = await prisma.contract.findFirst({
    where: {
      tenancyId: payload.tenancyId,
      kind: payload.kind,
      status: { not: "superseded" },
    },
  });
  if (existing) {
    throw conflict(
      `A non-superseded '${payload.kind}' contract already exists on this tenancy — supersede it first`
    );
  }
  return enqueueJob("contract.generate", payload as unknown as Prisma.InputJsonValue);
}

async function handleContractGenerate(job: Job) {
  const payload = job.payload as unknown as GeneratePayload;

  // 1. LOAD
  const requestedBy = payload.requestedByUserId
    ? await prisma.user.findUnique({ where: { id: payload.requestedByUserId } })
    : null;
  const actor = requestedBy ?? (await getOwner());
  const tenancy = await prisma.tenancy.findUnique({
    where: { id: payload.tenancyId },
    include: {
      property: {
        include: {
          ownerships: { where: { isMainLandlord: true }, include: { owner: true } },
        },
      },
      tenant: true,
    },
  });
  if (!tenancy) throw new Error("contract.generate: tenancy not found");
  const mainLandlord = findMainLandlord(tenancy.property.ownerships);

  // 2–3. BUILD + VALIDATE (fails loudly on any missing field)
  const viewModel = buildLeaseViewModel({
    landlord: {
      fullName: mainLandlord?.fullName ?? "",
      address: mainLandlord?.address ?? "",
      phone: mainLandlord?.phone ?? null,
      email: mainLandlord?.email ?? null,
    },
    property: tenancy.property,
    tenancy,
    tenant: tenancy.tenant,
    clauses: payload.clauses,
  });

  // 4–5. LAYOUT + WRITE PDF (directly; no browser runtime)
  const pdf = renderLeasePdf(viewModel);

  // 6. STORE via the files pattern (purpose='generated-lease', private)
  const filename = buildGeneratedLeaseFilename(viewModel);
  const storageKey = `generated-lease/${randomUUID()}/${filename}`;
  await uploadToStorage(storageKey, pdf, "application/pdf");
  const file = await prisma.file.create({
    data: {
      workspaceId: requireWorkspaceId(),
      ownerId: actor.id,
      purpose: "generated-lease",
      storageKey,
      contentType: "application/pdf",
      sizeBytes: BigInt(pdf.length),
      checksumSha256: createHash("sha256").update(pdf).digest("hex"),
      isPublic: false,
      status: "ready",
    },
  });

  // 7–8. generated_documents (+input_snapshot) and the draft contract row
  await prisma.$transaction(async (tx) => {
    const doc = await tx.generatedDocument.create({
      data: {
        workspaceId: requireWorkspaceId(),
        docType: "lease",
        templateVersion: TEMPLATE_VERSION,
        subjectType: "tenancy",
        subjectId: tenancy.id,
        fileId: file.id,
        inputSnapshot: viewModel as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.contract.create({
      data: {
        workspaceId: requireWorkspaceId(),
        tenancyId: tenancy.id,
        kind: payload.kind,
        source: "generated",
        fileId: file.id,
        generatedDocumentId: doc.id,
        status: "draft",
      },
    });
  });

  // 9. notify (in-app only per the §5.3 catalog)
  await notify(actor.id, "contract.generated", {
    title: `Lease generated for ${tenancy.tenant.fullName} at ${tenancy.property.nickname}`,
    body: `A draft ${payload.kind} contract is ready on the Contracts tab.`,
    linkPath: `/properties/${tenancy.propertyId}?tab=contracts`,
  });
}

async function onContractGenerateDead(job: Job) {
  const payload = job.payload as unknown as GeneratePayload;
  try {
    const requestedBy = payload.requestedByUserId
      ? await prisma.user.findUnique({ where: { id: payload.requestedByUserId } })
      : null;
    const actor = requestedBy ?? (await getOwner());
    await notify(actor.id, "contract.generation_failed", {
      title: "Contract generation failed",
      body: `Generating the ${payload.kind ?? "lease"} contract failed after ${job.attempts} attempts: ${job.lastError ?? "unknown error"}`,
      linkPath: `/settings`,
      dedupeKey: `contract.generation_failed:${job.id}`,
    });
  } catch (err) {
    console.error("contract.generate onDead notify failed:", err);
  }
}

registerJobHandler("contract.generate", handleContractGenerate, onContractGenerateDead);
