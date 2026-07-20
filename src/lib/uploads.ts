import { createHash, randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api/errors";
import { prisma, requireWorkspaceId } from "@/lib/db";
import { uploadToStorage } from "@/lib/storage";

/** Upload policies per purpose (PLAN.md §6). generated-lease is server-only. */
export const UPLOAD_POLICIES = {
  "lease-doc": {
    maxBytes: 25 * 1024 * 1024,
    contentTypes: ["application/pdf"],
  },
  certificate: {
    maxBytes: 25 * 1024 * 1024,
    contentTypes: ["application/pdf", "image/jpeg", "image/png"],
  },
  receipt: {
    maxBytes: 10 * 1024 * 1024,
    contentTypes: ["application/pdf", "image/jpeg", "image/png"],
  },
} as const;

export type UploadPurpose = keyof typeof UPLOAD_POLICIES;

/** Magic-byte sniffing — never trust the client's declared content type. */
function sniffContentType(buf: Buffer): string | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") {
    return "application/pdf";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  return null;
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "");
  return (cleaned || "file").slice(0, 120);
}

/**
 * Validates and stores an upload: policy checks (size, declared type, magic
 * bytes), server-generated storage key, checksum, pending→ready row.
 */
export async function storeUpload(opts: {
  purpose: UploadPurpose;
  filename: string;
  buffer: Buffer;
  ownerId: string;
}) {
  const policy = UPLOAD_POLICIES[opts.purpose];
  if (opts.buffer.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "Uploaded file is empty", [
      { field: "file", issue: "empty file" },
    ]);
  }
  if (opts.buffer.length > policy.maxBytes) {
    throw new ApiError("VALIDATION_ERROR", "File is too large", [
      {
        field: "file",
        issue: `max ${Math.round(policy.maxBytes / 1024 / 1024)} MB for purpose '${opts.purpose}'`,
      },
    ]);
  }
  const sniffed = sniffContentType(opts.buffer);
  if (!sniffed || !(policy.contentTypes as readonly string[]).includes(sniffed)) {
    throw new ApiError("VALIDATION_ERROR", "File type not allowed", [
      {
        field: "file",
        issue: `purpose '${opts.purpose}' accepts: ${policy.contentTypes.join(", ")} (checked by content, not extension)`,
      },
    ]);
  }

  const storageKey = `${opts.purpose}/${randomUUID()}/${sanitizeFilename(opts.filename)}`;
  const checksum = createHash("sha256").update(opts.buffer).digest("hex");

  const file = await prisma.file.create({
    data: {
      workspaceId: requireWorkspaceId(),
      ownerId: opts.ownerId,
      purpose: opts.purpose,
      storageKey,
      contentType: sniffed,
      sizeBytes: BigInt(opts.buffer.length),
      checksumSha256: checksum,
      isPublic: false,
      status: "pending",
    },
  });

  try {
    await uploadToStorage(storageKey, opts.buffer, sniffed);
  } catch (err) {
    await prisma.file.update({ where: { id: file.id }, data: { status: "failed" } });
    throw err;
  }

  return prisma.file.update({ where: { id: file.id }, data: { status: "ready" } });
}
