import type { Property, Tenancy, Tenant, UserSettings } from "@prisma/client";
import type {
  ContractGenerationJobContextDto,
  JobMissingFieldDto,
  TenancyStatus,
} from "@/lib/types";

type ContractJobTenancy = Tenancy & { property: Property; tenant: Tenant };
type ContractJobSettings = Pick<UserSettings, "landlordAddress" | "landlordPhone">;

const ERROR_FIELD_LABELS: Record<string, string> = {
  "landlord.fullName": "Landlord name",
  "landlord.address": "Landlord correspondence address (Settings)",
  "landlord.phone": "Landlord phone (Settings)",
  "tenant.fullName": "Tenant name",
  "tenant.phone": "Tenant phone",
  "property.fullAddress": "Property address",
  "tenancy.startDateLong": "Tenancy start date",
  "tenancy.startDateIso": "Tenancy start date",
  "tenancy.rentAmountDisplay": "Rent amount",
  "tenancy.rentDueDayOrdinal": "Rent due day",
  "tenancy.depositAmountDisplay": "Deposit amount",
  "tenancy.depositSchemeName": "Deposit scheme",
  "tenancy.depositReference": "Deposit reference",
  "clauses.petsDescription": "Pet description",
};

const CURRENT_DATA_PATHS = new Set([
  "tenant.fullName",
  "tenant.phone",
  "landlord.address",
  "landlord.phone",
  "property.fullAddress",
  "tenancy.depositAmountDisplay",
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
  settings: ContractJobSettings | null,
  lastError: string | null
): ContractGenerationJobContextDto {
  const missingFields: JobMissingFieldDto[] = [];

  if (tenancy) {
    if (!tenancy.tenant.fullName.trim()) {
      addMissingField(missingFields, "tenant.fullName");
    }
    if (!tenancy.tenant.phone?.trim()) {
      addMissingField(missingFields, "tenant.phone");
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
    if (tenancy.depositAmountCents == null) {
      addMissingField(missingFields, "tenancy.depositAmountDisplay");
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

  if (!settings?.landlordAddress?.trim()) {
    addMissingField(missingFields, "landlord.address");
  }
  if (!settings?.landlordPhone?.trim()) {
    addMissingField(missingFields, "landlord.phone");
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
  const needsLandlordSettings = missingFields.some((field) =>
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
    editPath: needsLandlordSettings
      ? "/settings"
      : canEditTenancy
        ? `/tenancies/${tenancyId}/edit`
        : propertyPath,
    canEditTenancy,
  };
}
