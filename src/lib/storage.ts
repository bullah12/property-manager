import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Single private bucket for every file in the app (PLAN.md §2). */
export const STORAGE_BUCKET = "files";

/** Signed GET URLs are short-lived (file-storage-uploads skill: 5–15 min). */
export const SIGNED_URL_TTL_SECONDS = 10 * 60;

function storageClient() {
  return createSupabaseAdminClient().storage.from(STORAGE_BUCKET);
}

/** Idempotently create the private bucket (called from seed/bootstrap). */
export async function ensureBucket() {
  const admin = createSupabaseAdminClient();
  const { data: buckets, error } = await admin.storage.listBuckets();
  if (error) throw new Error(`Could not list storage buckets: ${error.message}`);
  if (!buckets.some((b) => b.name === STORAGE_BUCKET)) {
    const { error: createError } = await admin.storage.createBucket(STORAGE_BUCKET, {
      public: false,
    });
    if (createError) throw new Error(`Could not create bucket: ${createError.message}`);
  }
}

export async function uploadToStorage(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
) {
  const { error } = await storageClient().upload(key, body, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
}

export async function createSignedDownloadUrl(key: string): Promise<string> {
  const { data, error } = await storageClient().createSignedUrl(
    key,
    SIGNED_URL_TTL_SECONDS
  );
  if (error || !data) throw new Error(`Could not sign URL: ${error?.message}`);
  return data.signedUrl;
}

export async function removeFromStorage(keys: string[]) {
  if (keys.length === 0) return;
  const { error } = await storageClient().remove(keys);
  if (error) throw new Error(`Storage delete failed: ${error.message}`);
}
