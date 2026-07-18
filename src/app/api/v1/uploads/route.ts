import { ApiError } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { requireAdmin } from "@/lib/auth";
import { serializeFile } from "@/lib/serializers";
import { storeUpload, UPLOAD_POLICIES, type UploadPurpose } from "@/lib/uploads";

/**
 * Multipart upload through the API (the internal-tool simplification the
 * file-storage-uploads skill allows). Fields: `file`, `purpose`.
 */
export const POST = apiHandler(async (req) => {
  const { user } = await requireAdmin();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Expected multipart/form-data", [
      { field: "(body)", issue: "not multipart form data" },
    ]);
  }

  const purpose = form.get("purpose");
  if (typeof purpose !== "string" || !(purpose in UPLOAD_POLICIES)) {
    throw new ApiError("VALIDATION_ERROR", "Invalid upload purpose", [
      { field: "purpose", issue: `must be one of: ${Object.keys(UPLOAD_POLICIES).join(", ")}` },
    ]);
  }

  const fileEntry = form.get("file");
  if (!(fileEntry instanceof Blob)) {
    throw new ApiError("VALIDATION_ERROR", "Missing file", [
      { field: "file", issue: "required" },
    ]);
  }

  const buffer = Buffer.from(await fileEntry.arrayBuffer());
  const filename = fileEntry instanceof File ? fileEntry.name : "upload";

  const file = await storeUpload({
    purpose: purpose as UploadPurpose,
    filename,
    buffer,
    ownerId: user.id,
  });

  return ok(serializeFile(file), 201);
});
