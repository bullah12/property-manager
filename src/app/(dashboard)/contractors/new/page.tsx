import type { Metadata } from "next";
import { ContractorForm } from "../contractor-form";

export const metadata: Metadata = { title: "New contractor" };

export default function NewContractorPage() {
  return <ContractorForm />;
}
