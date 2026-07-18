import type { Metadata } from "next";
import { Suspense } from "react";
import { NewTenancyScreen } from "./new-screen";

export const metadata: Metadata = { title: "New tenancy" };

export default function NewTenancyPage() {
  return (
    <Suspense>
      <NewTenancyScreen />
    </Suspense>
  );
}
