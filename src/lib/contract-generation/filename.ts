import type { LeaseV2ViewModel } from "./view-model";

function filenamePart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "Unknown";
}

export function buildGeneratedLeaseFilename(viewModel: LeaseV2ViewModel): string {
  return [
    "Tenancy_Agreement",
    filenamePart(viewModel.landlord.fullName),
    filenamePart(viewModel.tenant.fullName),
    viewModel.tenancy.startDateIso,
  ].join("_") + ".pdf";
}
