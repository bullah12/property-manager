import { z } from "zod";
import { conflict, notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createSignedDownloadUrl, SIGNED_URL_TTL_SECONDS } from "@/lib/storage";

const paramsSchema = z.object({ id: z.uuid() });

/** Short-lived signed GET URL for a private file (PLAN.md §6). */
export const GET = apiHandler<{ id: string }>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const file = await prisma.file.findUnique({ where: { id } });
  if (!file) throw notFound("File");
  if (file.status !== "ready") throw conflict("File is not ready for download");
  const url = await createSignedDownloadUrl(file.storageKey);
  return ok({ url, expiresInSeconds: SIGNED_URL_TTL_SECONDS });
});
