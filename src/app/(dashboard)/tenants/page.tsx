import type { Metadata } from "next";
import { Suspense } from "react";
import { TenantsList } from "./tenants-list";

export const metadata: Metadata = { title: "Tenants" };

export default function TenantsPage() {
  return (
    <Suspense>
      <TenantsList />
    </Suspense>
  );
}
