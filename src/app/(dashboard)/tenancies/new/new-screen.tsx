"use client";

import { useSearchParams } from "next/navigation";
import { TenancyForm } from "../tenancy-form";

export function NewTenancyScreen() {
  const searchParams = useSearchParams();
  const propertyId = searchParams.get("propertyId") ?? undefined;
  return <TenancyForm initialPropertyId={propertyId} />;
}
