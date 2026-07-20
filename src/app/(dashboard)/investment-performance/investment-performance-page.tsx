"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/components/money";
import { PanelLoading } from "@/components/panel-loading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SelectedPropertyInvestmentDashboard } from "@/app/(dashboard)/properties/[id]/tabs/investment-tab";
import { api } from "@/lib/api-client";
import type { PortfolioInvestmentSummaryDto, PortfolioMetricDto } from "@/lib/investment-types";

const PRESETS = [
  ["this_month", "This month"],
  ["tax_year", "This tax year"],
  ["calendar_year", "This calendar year"],
  ["last_12_months", "Last 12 months"],
  ["since_purchase", "Since purchase"],
  ["custom", "Custom"],
] as const;
const VALID_PRESETS = new Set(PRESETS.map(([value]) => value));

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function InvestmentPerformancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawPreset = searchParams.get("preset");
  const rawFrom = searchParams.get("from");
  const rawTo = searchParams.get("to");
  const validCustom = validDate(rawFrom) && validDate(rawTo) && rawFrom <= rawTo;
  const preset = VALID_PRESETS.has(rawPreset as (typeof PRESETS)[number][0]) && (rawPreset !== "custom" || validCustom)
    ? rawPreset!
    : "since_purchase";
  const from = preset === "custom" ? rawFrom! : undefined;
  const to = preset === "custom" ? rawTo! : undefined;
  const [draftFrom, setDraftFrom] = useState(from ?? "");
  const [draftTo, setDraftTo] = useState(to ?? "");
  const [propertySearch, setPropertySearch] = useState("");
  const queryParams = new URLSearchParams({ preset });
  if (from && to) {
    queryParams.set("from", from);
    queryParams.set("to", to);
  }
  const summaryQuery = useQuery({
    queryKey: ["portfolio-investment", preset, from ?? "", to ?? ""],
    queryFn: async () => (await api.get<PortfolioInvestmentSummaryDto>(`/api/v1/investment-performance?${queryParams}`)).data,
  });

  const properties = useMemo(() => summaryQuery.data?.properties ?? [], [summaryQuery.data?.properties]);
  const requestedPropertyId = searchParams.get("propertyId");
  const selectedProperty = properties.find((property) => property.id === requestedPropertyId)
    ?? properties.find((property) => property.status === "active")
    ?? properties[0];
  const visibleProperties = useMemo(() => {
    const needle = propertySearch.trim().toLocaleLowerCase("en-GB");
    return needle
      ? properties.filter((property) => `${property.nickname} ${property.address} ${property.status}`.toLocaleLowerCase("en-GB").includes(needle))
      : properties;
  }, [properties, propertySearch]);

  const replaceUrl = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value == null) next.delete(key);
      else next.set(key, value);
    }
    router.replace(`/investment-performance?${next.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (!summaryQuery.data) return;
    const changes: Record<string, string | null> = {};
    if (rawPreset !== preset) changes.preset = preset;
    if (preset !== "custom" && (rawFrom || rawTo)) {
      changes.from = null;
      changes.to = null;
    }
    if (selectedProperty && requestedPropertyId !== selectedProperty.id) changes.propertyId = selectedProperty.id;
    if (!selectedProperty && requestedPropertyId) changes.propertyId = null;
    if (Object.keys(changes).length) replaceUrl(changes);
    // Canonicalise only when API data or URL-derived values change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryQuery.data, preset, rawPreset, rawFrom, rawTo, requestedPropertyId, selectedProperty?.id]);

  useEffect(() => {
    if (preset !== "custom") return;
    setDraftFrom(from ?? "");
    setDraftTo(to ?? "");
  }, [preset, from, to]);

  const setPreset = (value: string) => {
    if (value === "custom") {
      const nextFrom = summaryQuery.data?.range.from ?? draftFrom;
      const nextTo = summaryQuery.data?.range.to ?? draftTo;
      setDraftFrom(nextFrom);
      setDraftTo(nextTo);
      replaceUrl({ preset: value, from: nextFrom, to: nextTo });
    } else {
      replaceUrl({ preset: value, from: null, to: null });
    }
  };
  const setCustomDate = (kind: "from" | "to", value: string) => {
    const nextFrom = kind === "from" ? value : draftFrom;
    const nextTo = kind === "to" ? value : draftTo;
    if (kind === "from") setDraftFrom(value);
    else setDraftTo(value);
    if (validDate(nextFrom) && validDate(nextTo) && nextFrom <= nextTo) {
      replaceUrl({ preset: "custom", from: nextFrom, to: nextTo });
    }
  };

  if (summaryQuery.isLoading) return <PanelLoading label="Calculating portfolio investment performance…" />;
  if (summaryQuery.isError || !summaryQuery.data) {
    return <div className="rounded-lg border p-6 text-sm text-muted-foreground">Investment performance could not be loaded. <button className="underline" onClick={() => summaryQuery.refetch()}>Retry</button></div>;
  }
  const summary = summaryQuery.data;

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Investment Performance</h1>
          <p className="text-sm text-muted-foreground">Review cash-basis performance across your portfolio and drill into one property’s detailed results.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2" aria-label="Investment date range controls">
          <div className="grid min-w-48 gap-1.5">
            <Label htmlFor="investment-range">Date range</Label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger id="investment-range"><SelectValue /></SelectTrigger>
              <SelectContent>{PRESETS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {preset === "custom" && <>
            <div className="grid gap-1.5"><Label htmlFor="investment-from">From</Label><Input id="investment-from" type="date" value={draftFrom} onChange={(event) => setCustomDate("from", event.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="investment-to">To</Label><Input id="investment-to" type="date" value={draftTo} onChange={(event) => setCustomDate("to", event.target.value)} /></div>
          </>}
        </div>
      </div>

      <section aria-labelledby="portfolio-summary-heading" className="space-y-3">
        <div>
          <h2 id="portfolio-summary-heading" className="text-lg font-semibold">Portfolio summary</h2>
          <p className="text-sm text-muted-foreground">{summary.propertiesRepresented} active {summary.propertiesRepresented === 1 ? "property" : "properties"} · {summary.range.from} to {summary.range.to} · actual cash basis</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryMetric label="Current estimated value" metric={summary.metrics.currentValue} total={summary.propertiesRepresented} />
          <SummaryMetric label="Mortgage balance" metric={summary.metrics.mortgageBalance} total={summary.propertiesRepresented} />
          <SummaryMetric label="Current equity" metric={summary.metrics.equity} total={summary.propertiesRepresented} />
          <SummaryMetric label="Total cash invested" metric={summary.metrics.cashInvested} total={summary.propertiesRepresented} />
          <SummaryMetric label="Gross rental income" metric={summary.metrics.grossRentalIncome} total={summary.propertiesRepresented} />
          <SummaryMetric label="Net operating income" metric={summary.metrics.netOperatingIncome} total={summary.propertiesRepresented} />
          <SummaryMetric label="Net cash flow" metric={summary.metrics.netCashFlow} total={summary.propertiesRepresented} />
          <Card><CardHeader className="pb-2"><CardDescription>Properties represented</CardDescription><CardTitle className="text-xl">{summary.propertiesRepresented}</CardTitle></CardHeader></Card>
          <RatioMetric label="Portfolio LTV" value={summary.ratios.ltv.valueBps} included={summary.ratios.ltv.includedProperties} total={summary.propertiesRepresented} />
          <RatioMetric label="Annualised gross yield" value={summary.ratios.grossYield.valueBps} included={summary.ratios.grossYield.includedProperties} total={summary.propertiesRepresented} />
        </div>
        {summary.warnings.length > 0 && <div className="rounded-md border border-amber-300 bg-amber-50/40 p-3 text-sm dark:bg-amber-950/10"><div className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4 text-amber-600" /> Partial portfolio totals</div><ul className="mt-1 list-disc space-y-1 pl-6 text-muted-foreground">{summary.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
      </section>

      <section aria-labelledby="selected-property-heading" className="space-y-4">
        <div>
          <h2 id="selected-property-heading" className="text-lg font-semibold">Selected property</h2>
          <p className="text-sm text-muted-foreground">Choose one active or archived property for the complete dashboard.</p>
        </div>
        {properties.length === 0 ? <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No properties are available. Add a property to begin tracking investment performance.</div> : <>
          <div className="grid max-w-2xl gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
            <div className="grid gap-1.5"><Label htmlFor="property-search">Search properties</Label><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="property-search" className="pl-9" value={propertySearch} onChange={(event) => setPropertySearch(event.target.value)} placeholder="Nickname, address or status" /></div></div>
            <div className="grid gap-1.5"><Label htmlFor="investment-property">Property</Label><Select value={selectedProperty?.id} onValueChange={(propertyId) => replaceUrl({ propertyId })}><SelectTrigger id="investment-property"><SelectValue placeholder="Select a property" /></SelectTrigger><SelectContent>{visibleProperties.map((property) => <SelectItem key={property.id} value={property.id}><span className="font-medium">{property.nickname}</span><span className="ml-2 text-muted-foreground">{property.address} · {property.status}</span></SelectItem>)}</SelectContent></Select></div>
          </div>
          {visibleProperties.length === 0 && <p className="text-sm text-muted-foreground">No properties match your search.</p>}
          {selectedProperty && !selectedProperty.hasInvestmentData && <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No investment records have been entered for {selectedProperty.nickname}. Use “Add record” below to get started.</div>}
          {selectedProperty && <SelectedPropertyInvestmentDashboard propertyId={selectedProperty.id} range={summary.range} />}
        </>}
      </section>
    </div>
  );
}

function SummaryMetric({ label, metric, total }: { label: string; metric: PortfolioMetricDto; total: number }) {
  const partial = metric.includedProperties < total;
  return <Card><CardHeader className="pb-2"><CardDescription>{label}</CardDescription><CardTitle className="text-xl">{metric.valueCents == null ? "Not available" : formatMoney(metric.valueCents)}</CardTitle></CardHeader>{partial && <CardContent className="pt-0 text-xs text-amber-700 dark:text-amber-400">Partial: {metric.includedProperties} of {total} properties</CardContent>}</Card>;
}

function RatioMetric({ label, value, included, total }: { label: string; value: number | null; included: number; total: number }) {
  return <Card><CardHeader className="pb-2"><CardDescription>{label} (weighted)</CardDescription><CardTitle className="text-xl">{value == null ? "Not available" : `${(value / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 })}%`}</CardTitle></CardHeader>{included < total && <CardContent className="pt-0 text-xs text-amber-700 dark:text-amber-400">Based on {included} of {total} properties with comparable data</CardContent>}</Card>;
}
