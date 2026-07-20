import type { Metadata } from "next";
import { ContractorDetail } from "./contractor-detail";

export const metadata: Metadata = { title: "Contractor" };

export default async function ContractorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContractorDetail id={id} />;
}
