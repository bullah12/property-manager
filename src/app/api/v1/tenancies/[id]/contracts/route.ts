import { z } from "zod";
import { ApiError, notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok, okList, listMeta } from "@/lib/api/respond";
import { parse, parseBody } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma, requireWorkspaceId } from "@/lib/db";
import { parseDateOnly } from "@/lib/dates";
import { dateOnly } from "@/lib/schemas/tenancy";
import { serializeContract } from "@/lib/serializers";
import { getTenancyOr404 } from "@/lib/tenancies";

const paramsSchema = z.object({ id: z.uuid() });

export const GET = apiHandler<{ id: string }>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  await getTenancyOr404(id);
  const contracts = await prisma.contract.findMany({
    where: { tenancyId: id },
    include: { file: true, tenancy: { include: { tenant: true } } },
    orderBy: { createdAt: "desc" },
  });
  return okList(
    contracts.map(serializeContract),
    listMeta(1, Math.max(contracts.length, 1), contracts.length)
  );
});

const attachSchema = z
  .object({
    fileId: z.uuid(),
    kind: z.enum(["lease", "renewal", "addendum"]),
    status: z.enum(["draft", "issued", "signed"]).default("draft"),
    signedOn: dateOnly.optional(),
  })
  .refine((o) => o.status !== "signed" || !!o.signedOn, {
    message: "signedOn is required when attaching as signed",
    path: ["signedOn"],
  });

/** Attach an UPLOADED contract (PLAN.md §6). Generated ones come from Phase 9. */
export const POST = apiHandler<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  await getTenancyOr404(id);
  const body = await parseBody(req, attachSchema);

  const file = await prisma.file.findUnique({ where: { id: body.fileId } });
  if (!file) throw notFound("File");
  if (file.purpose !== "lease-doc" || file.status !== "ready") {
    throw new ApiError("VALIDATION_ERROR", "File must be a ready 'lease-doc' upload", [
      { field: "fileId", issue: `got purpose='${file.purpose}', status='${file.status}'` },
    ]);
  }

  const contract = await prisma.contract.create({
    data: {
      workspaceId: requireWorkspaceId(),
      tenancyId: id,
      kind: body.kind,
      source: "uploaded",
      fileId: body.fileId,
      status: body.status,
      signedOn: body.signedOn ? parseDateOnly(body.signedOn) : null,
    },
    include: { file: true, tenancy: { include: { tenant: true } } },
  });
  return ok(serializeContract(contract), 201);
});
