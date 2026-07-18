/** API response DTOs (the camelCase JSON shapes the routes serialize). */

export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface SettingsDto {
  defaultLeadDays: number[];
  rentOverdueGraceDays: number;
  emailEnabled: boolean;
  clausePetsDefault: boolean;
  clauseGardenDefault: boolean;
  updatedAt: string;
}

export interface MeDto {
  user: UserDto;
  settings: SettingsDto;
}

export interface ListMetaDto {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface PropertyDto {
  id: string;
  nickname: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  postcode: string;
  propertyType: "house" | "flat" | "hmo" | "commercial";
  bedrooms: number | null;
  purchasePriceCents: number | null;
  currency: string;
  notes: string | null;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface TenantDto {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantListItemDto extends TenantDto {
  tenancyCount: number;
  currentProperties: string[];
}

export type TenancyStatus = "draft" | "active" | "ended" | "renewed";

export interface TenancyDto {
  id: string;
  propertyId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  rentAmountCents: number;
  rentDueDay: number;
  depositAmountCents: number | null;
  depositScheme: string | null;
  depositReference: string | null;
  currency: string;
  status: TenancyStatus;
  createdAt: string;
  updatedAt: string;
  tenant?: { id: string; fullName: string; email: string | null; phone: string | null };
  property?: { id: string; nickname: string; status: string };
}

export interface TenantDetailDto extends TenantDto {
  tenancies: TenancyDto[];
}

export interface FileDto {
  id: string;
  purpose: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string | null;
  status: "pending" | "ready" | "failed";
  createdAt: string;
}

export type ContractStatus = "draft" | "issued" | "signed" | "superseded";

export interface ContractDto {
  id: string;
  tenancyId: string;
  kind: "lease" | "renewal" | "addendum";
  source: "generated" | "uploaded";
  fileId: string;
  generatedDocumentId: string | null;
  signedOn: string | null;
  status: ContractStatus;
  createdAt: string;
  updatedAt: string;
  file?: FileDto;
  tenancy?: {
    id: string;
    startDate: string;
    endDate: string;
    status: TenancyStatus;
    tenant?: { id: string; fullName: string };
  };
}

export type ExpenseCategory =
  | "repairs"
  | "maintenance"
  | "insurance"
  | "mortgage_interest"
  | "certificates"
  | "agent_fees"
  | "utilities"
  | "other";

export interface TransactionDto {
  id: string;
  propertyId: string;
  tenancyId: string | null;
  direction: "income" | "expense";
  category: string;
  amountCents: number;
  currency: string;
  occurredOn: string;
  description: string | null;
  receiptFileId: string | null;
  rentPeriod: string | null;
  createdAt: string;
  updatedAt: string;
  property?: { id: string; nickname: string };
  tenancy?: { id: string; tenant?: { id: string; fullName: string } };
  receiptFile?: FileDto;
}

export interface PropertyDetailDto extends PropertyDto {
  stats: {
    currentRentCents: number | null;
    nextDeadline: string | null;
    ytdExpensesCents: number;
  };
}
