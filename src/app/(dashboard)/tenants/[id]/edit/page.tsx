import type { Metadata } from "next";
import { EditTenantScreen } from "./edit-screen";

export const metadata: Metadata = { title: "Edit tenant" };

export default async function EditTenantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditTenantScreen id={id} />;
}
