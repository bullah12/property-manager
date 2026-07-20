import { z } from "zod";
import { notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse, parseBody } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { patchContractorSchema } from "@/lib/schemas/contractor";
import { serializeContractor, serializeContractorReview } from "@/lib/serializers";

const paramsSchema = z.object({ id: z.uuid() });

export const GET = apiHandler<{ id: string }>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const contractor = await prisma.contractor.findUnique({
    where: { id },
    include: { reviews: { orderBy: [{ reviewedOn: "desc" }, { createdAt: "desc" }] } },
  });
  if (!contractor) throw notFound("Contractor");

  const { reviews, ...bare } = contractor;
  const averageRating = reviews.length
    ? reviews.reduce((total, review) => total + review.rating, 0) / reviews.length
    : null;
  return ok({
    ...serializeContractor(bare),
    averageRating,
    reviewCount: reviews.length,
    reviews: reviews.map(serializeContractorReview),
  });
});

export const PATCH = apiHandler<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const body = await parseBody(req, patchContractorSchema);
  const existing = await prisma.contractor.findUnique({ where: { id } });
  if (!existing) throw notFound("Contractor");
  const contractor = await prisma.contractor.update({ where: { id }, data: body });
  return ok(serializeContractor(contractor));
});
