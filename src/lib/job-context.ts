import type { Owner, Property, PropertyOwnership, Tenancy, Tenant } from "@prisma/client";
import type {
  ContractGenerationJobContextDto,
  JobMissingFieldDto,
  TenancyStatus,
} from "@/lib/types";
import { findMainLandlord } from "@/lib/property-ownership";

type ContractJobTenancy = Tenancy & {
  property: Property & { ownerships: (PropertyOwnership & { owner: Owner })[] };
  tenant: Tenant;
};
const ERROR_FIELD_LABELS: Record<string, string> = {
  "landlord.fullName": "Landlord name",
  "landlord.address": "Landlord address for notices (Property)",
  "tenant.fullName": "Tenant name",
  "property.fullAddress": "Property address",
  "tenancy.startDateLong": "Tenancy start date",
  "tenancy.startDateIso": "Tenancy start date",
  "tenancy.rentAmountDisplay": "Rent amount",
  "tenancy.rentDueDayOrdinal": "Rent due day",
  "clauses.petsDescription": "Pet description",
};

const CURRENT_DATA_PATHS = new Set([
  "tenant.fullName",
  "landlord.fullName",
  "landlord.address",
  "property.fullAddress",
]);

function addMissingField(
  fields: JobMissingFieldDto[],
  path: string,
  label = ERROR_FIELD_LABELS[path] ?? path
) {
  if (!fields.some((field) => field.path === path)) fields.push({ path, label });
}

/**
 * Builds user-facing context for contract generation jobs. Current tenancy
 * values are checked as well as the previous technical error, so a newly
 * queued job can show what needs attention before its first attempt.
 */
export function buildContractGenerationJobContext(
  tenancyId: string,
  contractKind: "lease" | "renewal",
  tenancy: ContractJobTenancy | undefined,
  lastError: string | null
): ContractGenerationJobContextDto {
  const missingFields: JobMissingFieldDto[] = [];

  if (tenancy) {
    if (!tenancy.tenant.fullName.trim()) {
      addMissingField(missingFields, "tenant.fullName");
    }
    if (!tenancy.property.addressLine1.trim()) {
      addMissingField(missingFields, "property.fullAddress");
    }
    if (!tenancy.property.city.trim()) {
      addMissingField(missingFields, "property.fullAddress");
    }
    if (!tenancy.property.postcode.trim()) {
      addMissingField(missingFields, "property.fullAddress");
    }
    const mainLandlord = findMainLandlord(tenancy.property.ownerships);
    if (!mainLandlord?.fullName.trim()) {
      addMissingField(missingFields, "landlord.fullName");
    }
    if (!mainLandlord?.address.trim()) {
      addMissingField(missingFields, "landlord.address");
    }
  } else {
    addMissingField(missingFields, "tenancy", "Tenancy record");
  }

  if (lastError) {
    for (const [path, label] of Object.entries(ERROR_FIELD_LABELS)) {
      // For fields loaded from the current records, the current value wins
      // over a stale error from a previous attempt.
      if (!CURRENT_DATA_PATHS.has(path) && lastError.includes(`${path}:`)) {
        addMissingField(missingFields, path, label);
      }
    }
  }

  const propertyPath = tenancy
    ? `/properties/${tenancy.propertyId}?tab=tenancy`
    : null;
  const canEditTenancy = tenancy?.status === "draft";
  const needsLandlordDetails = missingFields.some((field) =>
    field.path.startsWith("landlord.")
  );

  return {
    kind: "contract-generation",
    contractKind,
    tenancyId,
    tenancyStatus: tenancy ? (tenancy.status as TenancyStatus) : null,
    tenantName: tenancy?.tenant.fullName ?? null,
    propertyId: tenancy?.propertyId ?? null,
    propertyNickname: tenancy?.property.nickname ?? null,
    missingFields,
    linkPath: propertyPath,
    editPath: needsLandlordDetails && tenancy
      ? `/properties/${tenancy.propertyId}/edit`
      : canEditTenancy
        ? `/tenancies/${tenancyId}/edit`
        : propertyPath,
    canEditTenancy,
  };
}
