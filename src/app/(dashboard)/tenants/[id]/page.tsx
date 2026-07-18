import type { Metadata } from "next";
import { TenantDetail } from "./tenant-detail";

export const metadata: Metadata = { title: "Tenant" };

export default async function TenantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TenantDetail id={id} />;
}
