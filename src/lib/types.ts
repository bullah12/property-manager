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
  workspace: WorkspaceDto;
}

export interface WorkspaceDto {
  id: string;
  name: string;
  role: string;
}

export interface WorkspaceListDto {
  activeWorkspaceId: string;
  workspaces: WorkspaceDto[];
}

export interface WorkspaceMemberDto {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  joinedAt?: string;
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
  ownershipMode: "sole" | "shared";
  ownerships: PropertyOwnershipDto[];
  mainLandlord: PropertyOwnershipDto | null;
  currency: string;
  notes: string | null;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface PropertyOwnershipDto {
  id: string;
  ownerId: string;
  fullName: string;
  address: string;
  phone: string | null;
  email: string | null;
  ownershipPercentage: number;
  isMainLandlord: boolean;
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

export type ContractorTrade =
  | "plumber"
  | "electrician"
  | "gas_engineer"
  | "heating_engineer"
  | "builder"
  | "handyman"
  | "roofer"
  | "decorator"
  | "locksmith"
  | "cleaner"
  | "gardener"
  | "pest_control"
  | "drainage"
  | "appliance_repair"
  | "other";

export interface ContractorDto {
  id: string;
  businessName: string;
  contactName: string | null;
  trade: ContractorTrade;
  email: string | null;
  phone: string | null;
  website: string | null;
  serviceArea: string | null;
  registrationNumber: string | null;
  notes: string | null;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}

export interface ContractorListItemDto extends ContractorDto {
  averageRating: number | null;
  reviewCount: number;
}

export interface ContractorReviewDto {
  id: string;
  contractorId: string;
  rating: number;
  reviewedOn: string;
  workDescription: string;
  comments: string | null;
  wouldHireAgain: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContractorDetailDto extends ContractorDto {
  averageRating: number | null;
  reviewCount: number;
  reviews: ContractorReviewDto[];
}

export type TenancyStatus = "draft" | "active" | "ended" | "renewed";

export interface TenancyDto {
  id: string;
  propertyId: string;
  tenantId: string;
  startDate: string;
  endDate: string | null;
  endedOn: string | null;
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
    endDate: string | null;
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

export type ComplianceKind =
  | "gas_certificate"
  | "electrical_eicr"
  | "epc"
  | "smoke_co_check"
  | "selective_licence"
  | "inspection"
  | "insurance"
  | "custom";

export interface ReminderDto {
  id: string;
  subjectType: "compliance_item" | "tenancy";
  subjectId: string;
  dueOn: string;
  leadDays: number[];
  lastNotifiedLead: number | null;
  updatedAt: string;
  nextFire?: { lead: number; fireOn: string } | null;
}

export interface ComplianceItemDto {
  id: string;
  propertyId: string;
  kind: ComplianceKind;
  label: string;
  dueOn: string;
  completedOn: string | null;
  documentFileId: string | null;
  recurrenceMonths: number | null;
  createdAt: string;
  updatedAt: string;
  property?: { id: string; nickname: string };
  documentFile?: FileDto;
  reminder?: ReminderDto | null;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string | null;
  linkPath: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface JobDto {
  id: string;
  type: string;
  status: "pending" | "running" | "succeeded" | "failed" | "dead" | "cancelled";
  runAt: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  context: JobContextDto | null;
}

export interface JobMissingFieldDto {
  path: string;
  label: string;
}

export interface ContractGenerationJobContextDto {
  kind: "contract-generation";
  contractKind: "lease" | "renewal";
  tenancyId: string;
  tenancyStatus: TenancyStatus | null;
  tenantName: string | null;
  propertyId: string | null;
  propertyNickname: string | null;
  missingFields: JobMissingFieldDto[];
  linkPath: string | null;
  editPath: string | null;
  canEditTenancy: boolean;
}

export type JobContextDto = ContractGenerationJobContextDto;

export interface UpcomingDeadlineDto extends ReminderDto {
  subject: {
    label: string;
    propertyId: string;
    propertyNickname: string;
    linkPath: string;
  };
}

export interface PropertyDetailDto extends PropertyDto {
  stats: {
    currentRentCents: number | null;
    nextDeadline: string | null;
    ytdExpensesCents: number;
  };
}
