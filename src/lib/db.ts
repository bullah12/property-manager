import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient } from "@prisma/client";

interface WorkspaceStore {
  workspaceId: string;
}

const workspaceStorage = new AsyncLocalStorage<WorkspaceStore>();

const WORKSPACE_MODELS = new Set([
  "File",
  "Contract",
  "Property",
  "Owner",
  "PropertyOwnership",
  "Tenant",
  "Tenancy",
  "Transaction",
  "ComplianceItem",
  "Reminder",
  "Notification",
  "Job",
  "GeneratedDocument",
  "Contractor",
  "ContractorReview",
]);

const globalForPrisma = globalThis as unknown as { prismaBase?: PrismaClient };

const prismaBase = globalForPrisma.prismaBase ?? new PrismaClient();

type QueryArgs = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  create?: Record<string, unknown>;
  update?: Record<string, unknown>;
};

export function scopeWorkspaceArgs<T>(
  model: string | undefined,
  operation: string,
  args: T,
  workspaceId: string
): T {
  if (!model || !WORKSPACE_MODELS.has(model)) return args;

  const scoped = args as QueryArgs;
  if (
    operation === "findUnique" ||
    operation === "findUniqueOrThrow" ||
    operation === "findFirst" ||
    operation === "findFirstOrThrow" ||
    operation === "findMany" ||
    operation === "count" ||
    operation === "aggregate" ||
    operation === "groupBy" ||
    operation === "update" ||
    operation === "updateMany" ||
    operation === "updateManyAndReturn" ||
    operation === "delete" ||
    operation === "deleteMany"
  ) {
    scoped.where = { ...scoped.where, workspaceId };
  }
  if (
    operation === "create" ||
    operation === "update" ||
    operation === "updateMany" ||
    operation === "updateManyAndReturn"
  ) {
    scoped.data = { ...(scoped.data as Record<string, unknown>), workspaceId };
  } else if (operation === "createMany" || operation === "createManyAndReturn") {
    scoped.data = Array.isArray(scoped.data)
      ? scoped.data.map((row) => ({ ...row, workspaceId }))
      : { ...(scoped.data ?? {}), workspaceId };
  } else if (operation === "upsert") {
    scoped.where = { ...scoped.where, workspaceId };
    scoped.create = { ...scoped.create, workspaceId };
    scoped.update = { ...scoped.update, workspaceId };
  }
  return args;
}

/**
 * Workspace isolation is enforced here rather than relying on every route to
 * remember a filter. Calls made outside a workspace context (migrations,
 * seeding and explicit system jobs) remain unscoped.
 */
export const prisma = prismaBase.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const workspaceId = workspaceStorage.getStore()?.workspaceId;
        if (!workspaceId || !model || !WORKSPACE_MODELS.has(model)) {
          return query(args);
        }
        return query(scopeWorkspaceArgs(model, operation, args, workspaceId));
      },
    },
  },
});

/** Run system/background work inside an explicit workspace boundary. */
export function runInWorkspace<T>(workspaceId: string, fn: () => T): T {
  return workspaceStorage.run({ workspaceId }, fn);
}

export function currentWorkspaceId(): string | undefined {
  return workspaceStorage.getStore()?.workspaceId;
}

export function requireWorkspaceId(): string {
  const workspaceId = currentWorkspaceId();
  if (!workspaceId) throw new Error("A workspace context is required");
  return workspaceId;
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prismaBase = prismaBase;
