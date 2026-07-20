import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PropertyDetail } from "./property-detail";

export const metadata: Metadata = { title: "Property" };

export default async function PropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  if (tab === "investment") {
    redirect(`/investment-performance?propertyId=${encodeURIComponent(id)}`);
  }
  return (
    <Suspense>
      <PropertyDetail id={id} />
    </Suspense>
  );
}
