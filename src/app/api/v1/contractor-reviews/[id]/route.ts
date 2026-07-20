import { z } from "zod";
import { notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse, parseBody } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { patchContractorReviewSchema } from "@/lib/schemas/contractor";
import { serializeContractorReview } from "@/lib/serializers";

const paramsSchema = z.object({ id: z.uuid() });

export const PATCH = apiHandler<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const body = await parseBody(req, patchContractorReviewSchema);
  const existing = await prisma.contractorReview.findUnique({ where: { id } });
  if (!existing) throw notFound("Review");
  const review = await prisma.contractorReview.update({ where: { id }, data: body });
  return ok(serializeContractorReview(review));
});

export const DELETE = apiHandler<{ id: string }>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const existing = await prisma.contractorReview.findUnique({ where: { id } });
  if (!existing) throw notFound("Review");
  await prisma.contractorReview.delete({ where: { id } });
  return ok({ deleted: true });
});
