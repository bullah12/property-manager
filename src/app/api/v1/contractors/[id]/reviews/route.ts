import { z } from "zod";
import { notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse, parseBody } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createContractorReviewSchema } from "@/lib/schemas/contractor";
import { serializeContractorReview } from "@/lib/serializers";

const paramsSchema = z.object({ id: z.uuid() });

export const POST = apiHandler<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const body = await parseBody(req, createContractorReviewSchema);
  const contractor = await prisma.contractor.findUnique({ where: { id }, select: { id: true } });
  if (!contractor) throw notFound("Contractor");
  const review = await prisma.contractorReview.create({
    data: { ...body, contractorId: id },
  });
  return ok(serializeContractorReview(review), 201);
});
