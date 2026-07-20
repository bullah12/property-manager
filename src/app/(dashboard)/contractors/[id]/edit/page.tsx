import type { Metadata } from "next";
import { EditContractorScreen } from "./edit-screen";

export const metadata: Metadata = { title: "Edit contractor" };

export default async function EditContractorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditContractorScreen id={id} />;
}
