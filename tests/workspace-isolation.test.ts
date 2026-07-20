import assert from "node:assert/strict";
import test from "node:test";
import {
  currentWorkspaceId,
  runInWorkspace,
  scopeWorkspaceArgs,
} from "../src/lib/db";
import { requiresWorkspaceContext } from "../src/lib/api/handler";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("business reads are restricted to the active workspace", () => {
  const args = { where: { status: "active", workspaceId: B } };
  scopeWorkspaceArgs("Property", "findMany", args, A);
  assert.deepEqual(args.where, { status: "active", workspaceId: A });
});

test("business creates and updates cannot choose another workspace", () => {
  const create = { data: { nickname: "Test", workspaceId: B } };
  scopeWorkspaceArgs("Property", "create", create, A);
  assert.equal(create.data.workspaceId, A);

  const update: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  } = { where: { id: "record" }, data: { workspaceId: B } };
  scopeWorkspaceArgs("Property", "update", update, A);
  assert.equal(update.where.workspaceId, A);
  assert.equal(update.data.workspaceId, A);
});

test("identity and membership models are only scoped explicitly", () => {
  const args = { where: { id: "user" } };
  scopeWorkspaceArgs("User", "findUnique", args, A);
  assert.deepEqual(args.where, { id: "user" });
});

test("concurrent async workspace contexts remain isolated", async () => {
  const [first, second] = await Promise.all([
    runInWorkspace(A, async () => {
      await Promise.resolve();
      return currentWorkspaceId();
    }),
    runInWorkspace(B, async () => {
      await Promise.resolve();
      return currentWorkspaceId();
    }),
  ]);
  assert.equal(first, A);
  assert.equal(second, B);
  assert.equal(currentWorkspaceId(), undefined);
});

test("all private v1 APIs are wrapped while public and system routes are not", () => {
  assert.equal(requiresWorkspaceContext("/api/v1/properties"), true);
  assert.equal(requiresWorkspaceContext("/api/v1/files/id/download"), true);
  assert.equal(requiresWorkspaceContext("/api/v1/auth/login"), false);
  assert.equal(requiresWorkspaceContext("/api/v1/auth/diagnostics"), true);
  assert.equal(requiresWorkspaceContext("/api/v1/health"), false);
  assert.equal(requiresWorkspaceContext("/api/internal/cron/daily-scan"), false);
});
