import type { Metadata } from "next";
import { TenantForm } from "../tenant-form";

export const metadata: Metadata = { title: "New tenant" };

export default function NewTenantPage() {
  return <TenantForm />;
}
