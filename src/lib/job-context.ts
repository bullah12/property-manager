import type { Property, Tenancy, Tenant } from "@prisma/client";
import type {
  ContractGenerationJobContextDto,
  JobMissingFieldDto,
  TenancyStatus,
} from "@/lib/types";

type ContractJobTenancy = Tenancy & { property: Property; tenant: Tenant };

const ERROR_FIELD_LABELS: Record<string, string> = {
  "landlord.fullName": "Landlord name",
  "tenant.fullName": "Tenant name",
  "property.addressLine1": "Property address",
  "property.city": "Property city",
  "property.postcode": "Property postcode",
  "tenancy.startDateLong": "Tenancy start date",
  "tenancy.endDateLong": "Tenancy end date",
  "tenancy.termMonthsWords": "Tenancy term",
  "tenancy.rentAmountLegal": "Rent amount",
  "tenancy.rentDueDayOrdinal": "Rent due day",
  "tenancy.depositAmountLegal": "Deposit amount",
  "tenancy.depositSchemeName": "Deposit scheme",
  "tenancy.depositReference": "Deposit reference",
  "clauses.petsDescription": "Pet description",
};

const CURRENT_DATA_PATHS = new Set([
  "tenant.fullName",
  "property.addressLine1",
  "property.city",
  "property.postcode",
  "tenancy.depositAmountLegal",
  "tenancy.depositSchemeName",
  "tenancy.depositReference",
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
      addMissingField(missingFields, "property.addressLine1");
    }
    if (!tenancy.property.city.trim()) {
      addMissingField(missingFields, "property.city");
    }
    if (!tenancy.property.postcode.trim()) {
      addMissingField(missingFields, "property.postcode");
    }
    if (tenancy.depositAmountCents == null) {
      addMissingField(missingFields, "tenancy.depositAmountLegal");
    }
    if (!tenancy.depositScheme?.trim()) {
      addMissingField(missingFields, "tenancy.depositSchemeName");
    }
    if (!tenancy.depositReference?.trim()) {
      addMissingField(missingFields, "tenancy.depositReference");
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
    editPath: canEditTenancy ? `/tenancies/${tenancyId}/edit` : propertyPath,
    canEditTenancy,
  };
}
