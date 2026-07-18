import { conflict, notFound } from "@/lib/api/errors";
import { prisma } from "@/lib/db";

export async function getContractOr404(id: string) {
  const contract = await prisma.contract.findUnique({
    where: { id },
    include: { file: true, tenancy: { include: { tenant: true } } },
  });
  if (!contract) throw notFound("Contract");
  return contract;
}

/** State machine (PLAN.md §3): draft → issued → signed; any → superseded. */
export async function issueContract(id: string) {
  const contract = await getContractOr404(id);
  if (contract.status !== "draft") {
    throw conflict(`Only a draft contract can be issued (status: ${contract.status})`);
  }
  return prisma.contract.update({
    where: { id },
    data: { status: "issued" },
    include: { file: true, tenancy: { include: { tenant: true } } },
  });
}

export async function signContract(id: string, signedOn: Date, signedFileId?: string) {
  const contract = await getContractOr404(id);
  if (contract.status !== "issued" && contract.status !== "draft") {
    throw conflict(`Only a draft or issued contract can be signed (status: ${contract.status})`);
  }
  if (signedFileId) {
    const file = await prisma.file.findUnique({ where: { id: signedFileId } });
    if (!file || file.purpose !== "lease-doc" || file.status !== "ready") {
      throw conflict("Signed copy must be a ready 'lease-doc' upload");
    }
  }
  return prisma.contract.update({
    where: { id },
    data: {
      status: "signed",
      signedOn,
      ...(signedFileId ? { fileId: signedFileId } : {}),
    },
    include: { file: true, tenancy: { include: { tenant: true } } },
  });
}

export async function supersedeContract(id: string) {
  const contract = await getContractOr404(id);
  if (contract.status === "superseded") {
    throw conflict("Contract is already superseded");
  }
  return prisma.contract.update({
    where: { id },
    data: { status: "superseded" },
    include: { file: true, tenancy: { include: { tenant: true } } },
  });
}

/**
 * Activation rule (PLAN.md §7 Phase 4): a tenancy activates only with a
 * signed, non-superseded contract — or an explicit override.
 */
export async function assertSignedContract(tenancyId: string) {
  const signed = await prisma.contract.findFirst({
    where: { tenancyId, status: "signed" },
  });
  if (!signed) {
    throw conflict(
      "No signed contract on this tenancy — upload/sign one first, or activate with override"
    );
  }
}
