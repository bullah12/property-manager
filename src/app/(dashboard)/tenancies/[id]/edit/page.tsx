import type { Metadata } from "next";
import { EditTenancyScreen } from "./edit-screen";

export const metadata: Metadata = { title: "Edit tenancy" };

export default async function EditTenancyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditTenancyScreen id={id} />;
}
