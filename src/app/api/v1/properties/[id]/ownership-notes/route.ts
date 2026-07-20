import { z } from "zod";
import { ApiError, notFound } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parse, parseBody } from "@/lib/api/validate";
import { requireAdmin } from "@/lib/auth";
import { prisma, requireWorkspaceId } from "@/lib/db";
import { parseDateOnly } from "@/lib/dates";
import { createOwnershipNoteSchema } from "@/lib/schemas/ownership";
import { serializeOwnershipNote } from "@/lib/serializers";

const paramsSchema = z.object({ id: z.uuid() });

export const POST = apiHandler<{ id: string }>(async (req, { params }) => {
  const { user } = await requireAdmin();
  const { id } = parse(paramsSchema, params);
  const body = await parseBody(req, createOwnershipNoteSchema);
  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) throw notFound("Property");
  const [event, payment, file] = await Promise.all([
    body.eventId ? prisma.ownershipEvent.findUnique({ where: { id: body.eventId } }) : null,
    body.paymentId ? prisma.ownershipPayment.findUnique({ where: { id: body.paymentId } }) : null,
    body.documentFileId ? prisma.file.findUnique({ where: { id: body.documentFileId } }) : null,
  ]);
  if (event && event.propertyId !== id) throw new ApiError("VALIDATION_ERROR", "Event belongs to another property");
  if (payment && payment.propertyId !== id) throw new ApiError("VALIDATION_ERROR", "Payment belongs to another property");
  if (body.eventId && !event) throw notFound("Ownership event");
  if (body.paymentId && !payment) throw notFound("Ownership payment");
  if (body.documentFileId && (!file || file.status !== "ready" || file.purpose !== "ownership-doc")) {
    throw new ApiError("VALIDATION_ERROR", "Supporting document must be a ready ownership upload");
  }
  const note = await prisma.ownershipNote.create({
    data: {
      workspaceId: requireWorkspaceId(), propertyId: id,
      ownerId: body.ownerId, eventId: body.eventId, paymentId: body.paymentId,
      title: body.title, noteText: body.noteText,
      noteDate: parseDateOnly(body.noteDate), authorUserId: user.id,
      sensitivity: body.sensitivity,
      reviewOn: body.reviewOn ? parseDateOnly(body.reviewOn) : null,
      documentFileId: body.documentFileId,
    },
    include: { owner: true, author: true },
  });
  return ok(serializeOwnershipNote(note), 201);
});
