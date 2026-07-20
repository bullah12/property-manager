import type { Metadata } from "next";
import { Suspense } from "react";
import { InvestmentPerformancePage } from "./investment-performance-page";

export const metadata: Metadata = { title: "Investment Performance" };

export default function Page() {
  return (
    <Suspense>
      <InvestmentPerformancePage />
    </Suspense>
  );
}
