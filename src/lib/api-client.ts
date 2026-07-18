/** Minimal typed fetch wrapper for the app's own API (envelope-aware). */

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: { field: string; issue: string }[]
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

interface Envelope<T> {
  data: T;
  meta?: { page: number; perPage: number; total: number; totalPages: number };
}

async function request<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body?.error;
    throw new ApiClientError(
      err?.code ?? "INTERNAL",
      err?.message ?? `Request failed (${res.status})`,
      err?.details
    );
  }
  return body as Envelope<T>;
}

/** Multipart upload to POST /api/v1/uploads. */
export async function uploadFile(purpose: string, file: globalThis.File) {
  const form = new FormData();
  form.set("purpose", purpose);
  form.set("file", file);
  const res = await fetch("/api/v1/uploads", { method: "POST", body: form });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body?.error;
    throw new ApiClientError(
      err?.code ?? "INTERNAL",
      err?.message ?? `Upload failed (${res.status})`,
      err?.details
    );
  }
  return body as Envelope<import("./types").FileDto>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
