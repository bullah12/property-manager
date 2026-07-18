import type { Metadata } from "next";
import { EditPropertyScreen } from "./edit-screen";

export const metadata: Metadata = { title: "Edit property" };

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditPropertyScreen id={id} />;
}
