import type { Metadata } from "next";
import { PropertyForm } from "../property-form";

export const metadata: Metadata = { title: "New property" };

export default function NewPropertyPage() {
  return <PropertyForm />;
}
