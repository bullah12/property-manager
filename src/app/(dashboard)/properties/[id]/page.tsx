import type { Metadata } from "next";
import { Suspense } from "react";
import { PropertyDetail } from "./property-detail";

export const metadata: Metadata = { title: "Property" };

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <PropertyDetail id={id} />
    </Suspense>
  );
}
