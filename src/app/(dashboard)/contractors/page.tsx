import type { Metadata } from "next";
import { Suspense } from "react";
import { ContractorsList } from "./contractors-list";

export const metadata: Metadata = { title: "Contractors" };

export default function ContractorsPage() {
  return (
    <Suspense>
      <ContractorsList />
    </Suspense>
  );
}
