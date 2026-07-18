import { NextResponse } from "next/server";
import type { ErrorCode, ErrorDetail } from "./errors";
import { ERROR_STATUS } from "./errors";

/** List-response pagination meta per PLAN.md §6. */
export interface ListMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

/** Single-resource envelope: { data: … } */
export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

/** List envelope: { data: […], meta: {…} } */
export function okList<T>(data: T[], meta: ListMeta, status = 200): NextResponse {
  return NextResponse.json({ data, meta }, { status });
}

/** Error envelope: { error: { code, message, details? } } */
export function errorResponse(
  code: ErrorCode,
  message: string,
  details?: ErrorDetail[]
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details && details.length ? { details } : {}) } },
    { status: ERROR_STATUS[code] }
  );
}

export function listMeta(page: number, perPage: number, total: number): ListMeta {
  return { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}
