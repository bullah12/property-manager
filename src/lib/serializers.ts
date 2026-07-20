import type {
  ComplianceItem,
  Contract,
  Contractor,
  ContractorReview,
  File,
  Job,
  Notification,
  Property,
  Reminder,
  Tenancy,
  Tenant,
  Transaction,
  User,
  UserSettings,
} from "@prisma/client";
import { toDateOnly } from "@/lib/dates";

export const CURRENCY = "gbp";

/** API JSON is camelCase; timestamps ISO-8601 UTC (PLAN.md §6). */

export function serializeUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    timezone: user.timezone,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function serializeProperty(p: Property) {
  return {
    id: p.id,
    nickname: p.nickname,
    addressLine1: p.addressLine1,
    addressLine2: p.addressLine2,
    city: p.city,
    postcode: p.postcode,
    propertyType: p.propertyType,
    bedrooms: p.bedrooms,
    purchasePriceCents: p.purchasePriceCents,
    currency: CURRENCY,
    notes: p.notes,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function serializeTenant(t: Tenant) {
  return {
    id: t.id,
    fullName: t.fullName,
    email: t.email,
    phone: t.phone,
    notes: t.notes,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export function serializeContractor(c: Contractor) {
  return {
    id: c.id,
    businessName: c.businessName,
    contactName: c.contactName,
    trade: c.trade,
    email: c.email,
    phone: c.phone,
    website: c.website,
    serviceArea: c.serviceArea,
    registrationNumber: c.registrationNumber,
    notes: c.notes,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function serializeContractorReview(review: ContractorReview) {
  return {
    id: review.id,
    contractorId: review.contractorId,
    rating: review.rating,
    reviewedOn: toDateOnly(review.reviewedOn),
    workDescription: review.workDescription,
    comments: review.comments,
    wouldHireAgain: review.wouldHireAgain,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
  };
}

export function serializeTenancy(
  t: Tenancy & { tenant?: Tenant; property?: Property }
) {
  return {
    id: t.id,
    propertyId: t.propertyId,
    tenantId: t.tenantId,
    startDate: toDateOnly(t.startDate),
    endDate: toDateOnly(t.endDate),
    endedOn: t.endedOn ? toDateOnly(t.endedOn) : null,
    rentAmountCents: t.rentAmountCents,
    rentDueDay: t.rentDueDay,
    depositAmountCents: t.depositAmountCents,
    depositScheme: t.depositScheme,
    depositReference: t.depositReference,
    currency: CURRENCY,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    ...(t.tenant
      ? { tenant: { id: t.tenant.id, fullName: t.tenant.fullName, email: t.tenant.email, phone: t.tenant.phone } }
      : {}),
    ...(t.property
      ? { property: { id: t.property.id, nickname: t.property.nickname, status: t.property.status } }
      : {}),
  };
}

export function serializeFile(f: File) {
  return {
    id: f.id,
    purpose: f.purpose,
    filename: f.storageKey.split("/").pop() ?? f.storageKey,
    contentType: f.contentType,
    sizeBytes: Number(f.sizeBytes),
    checksumSha256: f.checksumSha256,
    status: f.status,
    createdAt: f.createdAt.toISOString(),
  };
}

export function serializeContract(
  c: Contract & { file?: File; tenancy?: Tenancy & { tenant?: Tenant } }
) {
  return {
    id: c.id,
    tenancyId: c.tenancyId,
    kind: c.kind,
    source: c.source,
    fileId: c.fileId,
    generatedDocumentId: c.generatedDocumentId,
    signedOn: c.signedOn ? toDateOnly(c.signedOn) : null,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    ...(c.file ? { file: serializeFile(c.file) } : {}),
    ...(c.tenancy
      ? {
          tenancy: {
            id: c.tenancy.id,
            startDate: toDateOnly(c.tenancy.startDate),
            endDate: toDateOnly(c.tenancy.endDate),
            status: c.tenancy.status,
            ...(c.tenancy.tenant
              ? { tenant: { id: c.tenancy.tenant.id, fullName: c.tenancy.tenant.fullName } }
              : {}),
          },
        }
      : {}),
  };
}

export function serializeTransaction(
  t: Transaction & {
    property?: Property;
    tenancy?: (Tenancy & { tenant?: Tenant }) | null;
    receiptFile?: File | null;
  }
) {
  return {
    id: t.id,
    propertyId: t.propertyId,
    tenancyId: t.tenancyId,
    direction: t.direction,
    category: t.category,
    amountCents: t.amountCents,
    currency: CURRENCY,
    occurredOn: toDateOnly(t.occurredOn),
    description: t.description,
    receiptFileId: t.receiptFileId,
    rentPeriod: t.rentPeriod ? toDateOnly(t.rentPeriod) : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    ...(t.property ? { property: { id: t.property.id, nickname: t.property.nickname } } : {}),
    ...(t.tenancy
      ? {
          tenancy: {
            id: t.tenancy.id,
            ...(t.tenancy.tenant
              ? { tenant: { id: t.tenancy.tenant.id, fullName: t.tenancy.tenant.fullName } }
              : {}),
          },
        }
      : {}),
    ...(t.receiptFile ? { receiptFile: serializeFile(t.receiptFile) } : {}),
  };
}

export function serializeComplianceItem(
  c: ComplianceItem & { property?: Property; documentFile?: File | null }
) {
  return {
    id: c.id,
    propertyId: c.propertyId,
    kind: c.kind,
    label: c.label,
    dueOn: toDateOnly(c.dueOn),
    completedOn: c.completedOn ? toDateOnly(c.completedOn) : null,
    documentFileId: c.documentFileId,
    recurrenceMonths: c.recurrenceMonths,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    ...(c.property ? { property: { id: c.property.id, nickname: c.property.nickname } } : {}),
    ...(c.documentFile ? { documentFile: serializeFile(c.documentFile) } : {}),
  };
}

export function serializeReminder(r: Reminder) {
  return {
    id: r.id,
    subjectType: r.subjectType,
    subjectId: r.subjectId,
    dueOn: toDateOnly(r.dueOn),
    leadDays: r.leadDays,
    lastNotifiedLead: r.lastNotifiedLead,
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function serializeNotification(n: Notification) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    linkPath: n.linkPath,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}

export function serializeJob(j: Job) {
  return {
    id: j.id,
    type: j.type,
    status: j.status,
    runAt: j.runAt.toISOString(),
    attempts: j.attempts,
    maxAttempts: j.maxAttempts,
    lastError: j.lastError,
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
  };
}

export function serializeSettings(s: UserSettings) {
  return {
    defaultLeadDays: s.defaultLeadDays,
    rentOverdueGraceDays: s.rentOverdueGraceDays,
    emailEnabled: s.emailEnabled,
    landlordAddress: s.landlordAddress,
    landlordPhone: s.landlordPhone,
    clausePetsDefault: s.clausePetsDefault,
    clauseGardenDefault: s.clauseGardenDefault,
    updatedAt: s.updatedAt.toISOString(),
  };
}
