"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Info, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { formatMoney, Money } from "@/components/money";
import { PanelLoading } from "@/components/panel-loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { api, ApiClientError } from "@/lib/api-client";
import type { InvestmentDashboardDto } from "@/lib/investment-types";

const PRESETS = [
  ["this_month", "This month"], ["tax_year", "This tax year"], ["calendar_year", "This calendar year"],
  ["last_12_months", "Last 12 months"], ["since_purchase", "Since purchase"], ["custom", "Custom"],
] as const;

type RecordKind = "owner" | "ownership" | "acquisition" | "acquisition_cost" | "ledger" | "valuation" | "loan" | "loan_event" | "forecast" | "planned_cost";

const RECORD_LABELS: Record<RecordKind, string> = {
  owner: "Owner (manage in Ownership)", ownership: "Ownership period (manage in Ownership)", acquisition: "Acquisition", acquisition_cost: "Acquisition cost",
  ledger: "Contribution or distribution", valuation: "Valuation", loan: "Mortgage / loan", loan_event: "Loan event", forecast: "Forecast assumptions", planned_cost: "Planned one-off cost",
};

export function InvestmentTab({ propertyId }: { propertyId: string }) {
  const queryClient = useQueryClient();
  const [preset, setPreset] = useState("since_purchase");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [recordKind, setRecordKind] = useState<RecordKind | null>(null);
  const [transactionType, setTransactionType] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const params = new URLSearchParams({ preset });
  if (preset === "custom" && from && to) { params.set("from", from); params.set("to", to); }
  const queryKey = ["investment", propertyId, params.toString()];
  const query = useQuery({
    queryKey,
    queryFn: async () => (await api.get<InvestmentDashboardDto>(`/api/v1/properties/${propertyId}/investment?${params}`)).data,
  });
  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post(`/api/v1/properties/${propertyId}/investment`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investment", propertyId] });
      queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
      setRecordKind(null);
      toast.success("Investment record saved");
    },
    onError: (error) => toast.error(error instanceof ApiClientError ? error.message : "Could not save record"),
  });

  const filteredTransactions = useMemo(() => (query.data?.transactions ?? []).filter((row) =>
    (transactionType === "all" || row.type === transactionType) && (ownerFilter === "all" || row.owner === ownerFilter)
  ), [query.data, transactionType, ownerFilter]);

  if (query.isLoading) return <PanelLoading label="Calculating investment performance…" />;
  if (query.isError || !query.data) return <div className="rounded-lg border p-6 text-sm text-muted-foreground">Investment performance could not be loaded. <button className="underline" onClick={() => query.refetch()}>Retry</button></div>;
  const data = query.data;
  const m = data.metrics;

  return (
    <TooltipProvider>
      <div className="space-y-6 pt-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Investment performance</h3>
            <p className="text-sm text-muted-foreground">Actual cash-basis management information · {data.range.from} to {data.range.to}</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div><Label className="sr-only">Date range</Label><Select value={preset} onValueChange={setPreset}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRESETS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            {preset === "custom" && <><Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field></>}
            <Button variant="outline" onClick={() => downloadCsv(filteredTransactions)}>Export CSV</Button>
            <Select onValueChange={(value) => setRecordKind(value as RecordKind)}><SelectTrigger><Plus className="size-4" /><SelectValue placeholder="Add record" /></SelectTrigger><SelectContent>{Object.entries(RECORD_LABELS).filter(([value]) => value !== "owner" && value !== "ownership").map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          </div>
        </div>

        {data.issues.length > 0 && <Card className="border-amber-300 bg-amber-50/40 dark:bg-amber-950/10"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="size-4 text-amber-600" /> Data quality ({data.issues.length})</CardTitle><CardDescription>Complete these records to improve reliability. Unavailable metrics are never shown as zero.</CardDescription></CardHeader><CardContent className="grid gap-2 md:grid-cols-2">{data.issues.map((issue) => <div key={issue.code} className="flex gap-2 text-sm"><Badge variant={issue.severity === "error" ? "destructive" : "secondary"}>{issue.severity}</Badge><span>{issue.message}</span></div>)}</CardContent></Card>}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Total cash invested" cents={m.totalCashInvestedCents} formula={data.formulas.totalCashInvested} />
          <Metric label="Current estimated value" cents={m.currentValueCents} formula="Latest dated valuation. Estimated valuations are labels, not sale prices." badge={m.currentValuationSource ?? undefined} />
          <Metric label="Mortgage balance" cents={m.currentMortgageBalanceCents} formula="Opening secured balances plus borrowing, less principal repayments and refinance outflows." />
          <Metric label="Current equity" cents={m.currentEquityCents} formula={data.formulas.currentEquity} />
          <Metric label="Gross rental income" cents={m.grossRentalIncomeCents} formula="Rent transactions actually received in the selected period." />
          <Metric label="Operating expenses" cents={m.operatingExpensesCents} formula="Paid expenses excluding financing, principal, owner movements, tax and depreciation." />
          <Metric label="Net operating income" cents={m.noiCents} formula={data.formulas.noi} />
          <Metric label="Mortgage interest" cents={m.mortgageInterestCents} formula="Paid mortgage-interest transactions plus unmatched loan interest/finance events." />
          <Metric label="Principal repayments" cents={m.mortgagePrincipalCents} formula="Loan principal paid. Reduces cash flow and debt; not an operating expense." />
          <Metric label="Net cash flow" cents={m.netCashFlowCents} formula={data.formulas.netCashFlow} />
          <Metric label="Capital appreciation" cents={m.capitalAppreciationCents} formula="Latest valuation less purchase price. Unrealised and not recovered cash." badge="unrealised" />
          <Metric label="Total return" cents={m.totalReturnCents} formula="NOI less finance costs plus unrealised appreciation. Principal is equity transfer and therefore neutral." />
          <Metric label="Capital recovered" value={percent(m.recoveredBps)} formula={data.formulas.capitalRecovered} />
          <Metric label="Annualised return" value={percent(m.annualisedReturnBps)} formula="Selected-period total return annualised and divided by actual cash invested." />
          <Metric label="Current monthly rent" cents={m.currentMonthlyRentCents} formula="Contractual monthly rent on the active tenancy; not future actual income." />
          <Metric label="Occupancy rate" value={percent(m.occupancyBps)} formula="Days covered by a tenancy divided by days in the selected period." />
        </div>

        {data.owners.length > 0 && <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Owner return summary</TableHead><TableHead>Current share</TableHead><TableHead>Investment recovered</TableHead><TableHead>Cash-on-cash</TableHead><TableHead>XIRR incl. current equity</TableHead><TableHead className="text-right">Distribution variance</TableHead></TableRow></TableHeader><TableBody>{data.owners.map((owner) => <TableRow key={owner.id}><TableCell className="font-medium">{owner.name}</TableCell><TableCell>{percent(owner.currentOwnershipBps)}</TableCell><TableCell>{percent(owner.recoveredBps)}</TableCell><TableCell>{percent(owner.cashOnCashBps)}</TableCell><TableCell>{owner.xirr == null ? "Not available" : `${(owner.xirr * 100).toFixed(2)}%`}</TableCell><TableCell className={owner.distributionVarianceCents === 0 ? "text-right" : "text-right text-amber-700 dark:text-amber-400"}><Money cents={owner.distributionVarianceCents} /></TableCell></TableRow>)}</TableBody></Table></div>}

        <Tabs defaultValue="performance">
          <TabsList className="flex-wrap"><TabsTrigger value="performance">Performance</TabsTrigger><TabsTrigger value="owners">Owners</TabsTrigger><TabsTrigger value="recovery">Recovery & leverage</TabsTrigger><TabsTrigger value="transactions">Transactions</TabsTrigger></TabsList>
          <TabsContent value="performance" className="space-y-4 pt-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Income, expenses and cash flow" description="Actual monthly records; principal is included in net cash flow.">{data.monthly.length ? <ResponsiveContainer width="100%" height={280}><LineChart data={data.monthly} accessibilityLayer><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis tickFormatter={(v) => `£${Math.round(v / 100)}`} /><ChartTooltip formatter={(v) => formatMoney(Number(v))} /><Legend /><Line name="Income" dataKey="incomeCents" stroke="#2563eb" strokeWidth={2} /><Line name="Expenses" dataKey="expensesCents" stroke="#dc2626" strokeWidth={2} strokeDasharray="5 4" /><Line name="Net cash flow" dataKey="netCashFlowCents" stroke="#15803d" strokeWidth={2} /></LineChart></ResponsiveContainer> : <Empty text="Add received rent or paid expenses to see trends." />}</ChartCard>
              <ChartCard title="Expense breakdown" description="Actual operating expenses by category.">{data.expenseBreakdown.length ? <ResponsiveContainer width="100%" height={280}><PieChart accessibilityLayer><Pie data={data.expenseBreakdown} dataKey="amountCents" nameKey="category" outerRadius={90} label={({ name }) => String(name).replaceAll("_", " ")}>{data.expenseBreakdown.map((_, index) => <Cell key={index} fill={["#2563eb", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2"][index % 5]} />)}</Pie><ChartTooltip formatter={(v) => formatMoney(Number(v))} /><Legend /></PieChart></ResponsiveContainer> : <Empty text="No operating expenses in this period." />}</ChartCard>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Actual and forecast cash flow" description="Solid points are actual; dashed points are forecast from stored assumptions.">{data.forecastMonthly.length ? <ResponsiveContainer width="100%" height={280}><LineChart data={[...data.monthly.map((row) => ({ ...row, actualCents: row.netCashFlowCents })), ...data.forecastMonthly.map((row) => ({ ...row, forecastCents: row.netCashFlowCents }))]} accessibilityLayer><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis tickFormatter={(v) => `£${Math.round(v / 100)}`} /><ChartTooltip formatter={(v) => formatMoney(Number(v))} /><Legend /><Line name="Actual cash flow" dataKey="actualCents" stroke="#15803d" strokeWidth={2} connectNulls={false} /><Line name="Forecast cash flow" dataKey="forecastCents" stroke="#7c3aed" strokeWidth={2} strokeDasharray="6 4" connectNulls={false} /></LineChart></ResponsiveContainer> : <Empty text="Add forecast assumptions to compare actual and forecast performance." />}</ChartCard>
              <ChartCard title="Return components" description="Separates rental performance, debt principal converted to equity, and unrealised appreciation."><ResponsiveContainer width="100%" height={280}><BarChart data={data.returnBreakdown} accessibilityLayer><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="component" /><YAxis tickFormatter={(v) => `£${Math.round(v / 100)}`} /><ChartTooltip formatter={(v) => formatMoney(Number(v))} /><Bar name="Return component" dataKey="amountCents" fill="#2563eb" /></BarChart></ResponsiveContainer></ChartCard>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Gross yield" value={percent(m.grossYieldBps)} formula={data.formulas.grossYield} /><Metric label="Net yield" value={percent(m.netYieldBps)} formula={data.formulas.netYield} /><Metric label="Cash-on-cash" value={percent(m.cashOnCashBps)} formula={data.formulas.cashOnCash} /><Metric label="Expense ratio" value={percent(m.operatingExpenseRatioBps)} formula="Operating expenses divided by gross operating income." /><Metric label="Simple ROI" value={percent(m.simpleRoiBps)} formula="Cash returned plus current equity, less contributed capital, divided by contributed capital." /><Metric label="Equity multiple" value={multiple(m.equityMultipleBps)} formula={data.formulas.equityMultiple} /><Metric label="Property XIRR" value={m.xirr == null ? "Not available" : `${(m.xirr * 100).toFixed(2)}%`} formula="Annualised return using the actual dates of contributions and cash returns, plus current equity as an unrealised terminal value." /><Metric label="Return excluding appreciation" cents={m.returnExcludingAppreciationCents} formula="NOI less financing costs. Principal repayment is added back because it converts cash to equity." /></div>
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground"><strong>Why NOI and cash flow differ:</strong> NOI measures property operations before financing. Actual cash flow also deducts mortgage interest and principal repayments.</p>
          </TabsContent>
          <TabsContent value="owners" className="space-y-4 pt-4">
            {!data.owners.length ? <Empty text="Add each owner and an effective ownership period to calculate owner returns." /> : <><div className="grid gap-4 lg:grid-cols-2">{data.owners.map((owner) => <Card key={owner.id}><CardHeader><CardTitle className="flex items-center justify-between text-base"><span>{owner.name} {owner.isMainLandlord && <Badge>main landlord</Badge>}</span><span>{percent(owner.currentOwnershipBps)}</span></CardTitle><CardDescription>{owner.periods.map((p) => `${percent(p.percentageBps)} from ${p.effectiveFrom}${p.effectiveTo ? ` to ${p.effectiveTo}` : ""}`).join(" · ") || "No ownership period"}</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-3 text-sm"><OwnerValue label="Actual contributed" cents={owner.contributedCents} /><OwnerValue label="Income entitlement" cents={owner.allocatedIncomeCents} /><OwnerValue label="Expense allocation" cents={owner.allocatedExpensesCents} /><OwnerValue label="Principal allocation" cents={owner.allocatedPrincipalCents} /><OwnerValue label="Actual distributions" cents={owner.distributionsCents} /><OwnerValue label="Current equity" cents={owner.currentEquityCents} /><OwnerValue label="Distribution variance" cents={owner.distributionVarianceCents} warn={owner.distributionVarianceCents !== 0} /><OwnerValue label="Cash-on-cash" value={percent(owner.cashOnCashBps)} /></CardContent></Card>)}</div><ChartCard title="Contributions, entitlement and distributions" description="Economic allocation and cash movements are intentionally shown separately."><ResponsiveContainer width="100%" height={300}><BarChart data={data.owners} accessibilityLayer><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis tickFormatter={(v) => `£${Math.round(v / 100)}`} /><ChartTooltip formatter={(v) => formatMoney(Number(v))} /><Legend /><Bar name="Contributed" dataKey="contributedCents" fill="#2563eb" /><Bar name="Entitlement" dataKey="entitlementCents" fill="#7c3aed" /><Bar name="Distributed" dataKey="distributionsCents" fill="#15803d" /></BarChart></ResponsiveContainer></ChartCard></>}
          </TabsContent>
          <TabsContent value="recovery" className="space-y-4 pt-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Capital recovered" cents={m.capitalRecoveredCents} formula={data.formulas.capitalRecovered} /><Metric label="Remaining to recover" cents={m.recovery.remainingCents} formula="Actual contributed capital less qualifying cash returns." /><Metric label="Recent monthly free cash flow" cents={m.recentMonthlyFreeCashFlowCents} formula="Average actual net cash flow over the latest six recorded months." /><Metric label="Estimated recovery date" value={m.recovery.date ?? "Not available"} formula="Remaining capital divided by recent monthly free cash flow. No date is produced when cash flow is zero or negative." /></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Current / initial LTV" value={`${percent(m.ltvBps)} / ${percent(m.initialLtvBps)}`} formula={data.formulas.ltv} /><Metric label="Debt service coverage" value={multiple(m.dscrBps)} formula={data.formulas.dscr} /><Metric label="Interest coverage" value={multiple(m.interestCoverageBps)} formula={data.formulas.interestCoverage} /><Metric label="Break-even occupancy" value={percent(m.breakEvenOccupancyBps)} formula="Operating expenses plus mortgage interest divided by potential contractual rent for the period." /><Metric label="Equity from principal" cents={m.equityFromPrincipalCents} formula="Cumulative recorded principal repayments through today." /><Metric label="Debt service" cents={m.debtServiceCents} formula="Selected-period mortgage interest, finance charges and principal repayments." /><Metric label="Refinance headroom" cents={m.refinanceHeadroomCents} formula="Configured target LTV multiplied by current value, less secured debt. Never shown below zero." /></div><Card><CardHeader><CardTitle className="text-base">Recovery scenarios</CardTitle><CardDescription>Forecast cash flow adjusted to 80%, 100% and 120%. Unrealised appreciation is excluded.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3">{data.recoveryScenarios.map((scenario) => <OwnerValue key={scenario.scenario} label={title(scenario.scenario)} value={scenario.date ? `${scenario.date} (${scenario.months} months)` : "Not available — cash flow is not positive"} />)}</CardContent></Card>{data.equityHistory.length ? <ChartCard title="Value, mortgage and equity history" description="Valuations are dated snapshots; mortgage balances derive from loan events at each date."><ResponsiveContainer width="100%" height={280}><LineChart data={data.equityHistory} accessibilityLayer><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis tickFormatter={(v) => `£${Math.round(v / 100)}`} /><ChartTooltip formatter={(v) => formatMoney(Number(v))} /><Legend /><Line name="Property value" dataKey="valueCents" stroke="#7c3aed" strokeWidth={2} /><Line name="Mortgage balance" dataKey="mortgageBalanceCents" stroke="#dc2626" strokeWidth={2} strokeDasharray="5 4" /><Line name="Equity" dataKey="equityCents" stroke="#15803d" strokeWidth={2} /></LineChart></ResponsiveContainer></ChartCard> : null}</TabsContent>
          <TabsContent value="transactions" className="space-y-3 pt-4"><div className="flex flex-wrap gap-2"><Select value={transactionType} onValueChange={setTransactionType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["all", "income", "expense", "contribution", "distribution", "financing"].map((x) => <SelectItem key={x} value={x}>{x === "all" ? "All types" : title(x)}</SelectItem>)}</SelectContent></Select><Select value={ownerFilter} onValueChange={setOwnerFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All owners</SelectItem>{data.owners.map((x) => <SelectItem key={x.id} value={x.name}>{x.name}</SelectItem>)}</SelectContent></Select></div><div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type / category</TableHead><TableHead>Description</TableHead><TableHead>Owner</TableHead><TableHead>Status</TableHead><TableHead>Source</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{filteredTransactions.map((row) => <TableRow key={`${row.source}-${row.id}`}><TableCell>{row.date}</TableCell><TableCell>{title(row.type)} · {title(row.category)}</TableCell><TableCell>{row.description ?? "—"}</TableCell><TableCell>{row.owner ?? "—"}</TableCell><TableCell><Badge variant={row.status === "actual" ? "secondary" : "outline"}>{row.status}</Badge></TableCell><TableCell>{row.sourceHref ? <Link className="underline" href={`/properties/${propertyId}${row.sourceHref}`}>{title(row.source)}</Link> : title(row.source)}</TableCell><TableCell className="text-right"><Money cents={row.amountCents} /></TableCell></TableRow>)}{!filteredTransactions.length && <TableRow><TableCell colSpan={7}><Empty text="No records match these filters." /></TableCell></TableRow>}</TableBody></Table></div></TabsContent>
        </Tabs>
        <p className="text-xs text-muted-foreground">{data.disclaimer} Forecast and estimated values are labelled and kept separate from actual records.</p>
        <RecordDialog kind={recordKind} onClose={() => setRecordKind(null)} data={data} pending={mutation.isPending} onSubmit={(payload) => mutation.mutate(payload)} />
      </div>
    </TooltipProvider>
  );
}

function Metric({ label, cents, value, formula, badge }: { label: string; cents?: number | null; value?: string; formula: string; badge?: string }) {
  const display = value ?? (cents == null ? "Not available" : formatMoney(cents));
  return <Card><CardHeader className="pb-2"><CardDescription className="flex items-center gap-1">{label}<Tooltip><TooltipTrigger asChild><button aria-label={`Formula for ${label}`}><Info className="size-3.5" /></button></TooltipTrigger><TooltipContent className="max-w-72">{formula}</TooltipContent></Tooltip>{badge && <Badge variant="outline">{badge}</Badge>}</CardDescription><CardTitle className="text-xl">{display}</CardTitle></CardHeader></Card>;
}

function OwnerValue({ label, cents, value, warn }: { label: string; cents?: number | null; value?: string; warn?: boolean }) { return <div className={warn ? "rounded bg-amber-50 p-2 dark:bg-amber-950/20" : "p-2"}><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium">{value ?? (cents == null ? "Not available" : formatMoney(cents))}</div></div>; }
function ChartCard({ title: chartTitle, description, children }: { title: string; description: string; children: React.ReactNode }) { return <Card><CardHeader><CardTitle className="text-base">{chartTitle}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent><div role="img" aria-label={`${chartTitle}. ${description}`}>{children}</div></CardContent></Card>; }
function Empty({ text }: { text: string }) { return <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{text}</div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="grid gap-1.5"><Label>{label}</Label>{children}</div>; }
function percent(bps: number | null) { return bps == null ? "Not available" : `${(bps / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 })}%`; }
function multiple(bps: number | null) { return bps == null ? "Not available" : `${(bps / 10_000).toLocaleString("en-GB", { maximumFractionDigits: 2 })}×`; }
function title(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (x) => x.toUpperCase()); }
function downloadCsv(rows: InvestmentDashboardDto["transactions"]) {
  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [
    ["Date", "Type", "Category", "Description", "Amount", "Owner", "Status", "Source", "Notes"],
    ...rows.map((row) => [row.date, row.type, row.category, row.description, (row.amountCents / 100).toFixed(2), row.owner, row.status, row.source, row.notes]),
  ].map((row) => row.map(quote).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "investment-transactions.csv";
  link.click();
  URL.revokeObjectURL(url);
}
function moneyToCents(value: FormDataEntryValue | null) { return Math.round(Number(value) * 100); }
function percentToBps(value: FormDataEntryValue | null) { return Math.round(Number(value) * 100); }
function optionalMoneyToCents(value: FormDataEntryValue | null) { return value == null || value === "" ? null : moneyToCents(value); }
function optionalPercentToBps(value: FormDataEntryValue | null) { return value == null || value === "" ? null : percentToBps(value); }

function RecordDialog({ kind, onClose, data, pending, onSubmit }: { kind: RecordKind | null; onClose: () => void; data: InvestmentDashboardDto; pending: boolean; onSubmit: (payload: Record<string, unknown>) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!kind) return;
    const form = new FormData(event.currentTarget);
    const s = (name: string) => String(form.get(name) ?? "") || null;
    let payload: Record<string, unknown> = { action: kind };
    if (kind === "owner") payload = { ...payload, name: s("name"), email: s("email"), isMainLandlord: form.get("isMainLandlord") === "on", notes: s("notes") };
    if (kind === "ownership") payload = { ...payload, ownerId: s("ownerId"), percentageBps: percentToBps(form.get("percentage")), effectiveFrom: s("date"), effectiveTo: s("endDate"), notes: s("notes") };
    if (kind === "acquisition") payload = { ...payload, purchasePriceCents: moneyToCents(form.get("amount")), purchaseCompletionDate: s("date") };
    if (kind === "acquisition_cost") payload = { ...payload, category: s("category"), amountCents: moneyToCents(form.get("amount")), occurredOn: s("date"), fundingSource: s("fundingSource"), ownerId: s("ownerId"), description: s("description") };
    if (kind === "ledger") payload = { ...payload, ownerId: s("ownerId"), entryType: s("entryType"), amountCents: moneyToCents(form.get("amount")), occurredOn: s("date"), description: s("description"), reason: s("reason") };
    if (kind === "valuation") payload = { ...payload, valueCents: moneyToCents(form.get("amount")), valuedOn: s("date"), source: s("source"), notes: s("notes") };
    if (kind === "loan") payload = { ...payload, name: s("name"), lender: s("lender"), originalBalanceCents: moneyToCents(form.get("originalBalance")), openingBalanceCents: moneyToCents(form.get("openingBalance")), interestRateBps: optionalPercentToBps(form.get("interestRate")), repaymentType: s("repaymentType"), monthlyPaymentCents: optionalMoneyToCents(form.get("monthlyPayment")), startedOn: s("date"), endsOn: s("endDate"), secured: true, notes: s("notes") };
    if (kind === "loan_event") payload = { ...payload, loanId: s("loanId"), eventType: s("eventType"), amountCents: moneyToCents(form.get("amount")), occurredOn: s("date"), description: s("description") };
    if (kind === "forecast") payload = { ...payload, expectedMonthlyRentCents: optionalMoneyToCents(form.get("expectedRent")), rentGrowthBps: optionalPercentToBps(form.get("rentGrowth")), occupancyBps: optionalPercentToBps(form.get("occupancy")), expenseInflationBps: optionalPercentToBps(form.get("expenseInflation")), appreciationBps: optionalPercentToBps(form.get("appreciation")), mortgageInterestBps: optionalPercentToBps(form.get("mortgageInterest")), monthlyRepaymentCents: optionalMoneyToCents(form.get("monthlyRepayment")), horizonMonths: Number(form.get("horizon")), targetReturnBps: optionalPercentToBps(form.get("targetReturn")), targetRecoveryDate: s("targetDate"), targetLtvBps: optionalPercentToBps(form.get("targetLtv")) };
    if (kind === "planned_cost") payload = { ...payload, category: s("category"), amountCents: moneyToCents(form.get("amount")), plannedOn: s("date"), description: s("description") };
    onSubmit(payload);
  };
  const today = new Date().toISOString().slice(0, 10);
  if (kind === "planned_cost") return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>Add planned one-off cost</DialogTitle><DialogDescription>Stored as forecast only; it will never be counted as an actual paid expense.</DialogDescription></DialogHeader><form className="grid gap-4" onSubmit={submit}><Text name="category" label="Category" required /><MoneyInput name="amount" label="Expected amount" /><Text name="date" label="Planned date" type="date" defaultValue={today} required /><Text name="description" label="Description" /><DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save forecast cost"}</Button></DialogFooter></form></DialogContent></Dialog>;
  return <Dialog open={kind != null} onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Add {kind ? RECORD_LABELS[kind].toLowerCase() : "record"}</DialogTitle><DialogDescription>Amounts are stored in minor units and calculations update from the dated source record.</DialogDescription></DialogHeader>{kind && <form className="grid gap-4" onSubmit={submit}><div className="grid gap-4 sm:grid-cols-2">{kind === "owner" && <><Text name="name" label="Owner name" required /><Text name="email" label="Email" type="email" /><label className="flex items-center gap-2 text-sm"><input name="isMainLandlord" type="checkbox" /> Main landlord (administrative only)</label><Text name="notes" label="Notes" /></>}{kind === "ownership" && <><OwnerSelect data={data} /><MoneyInput name="percentage" label="Ownership percentage" suffix="%" /><Text name="date" label="Effective from" type="date" defaultValue={data.property.purchaseCompletionDate ?? today} required /><Text name="endDate" label="Effective to (optional)" type="date" /><Text name="notes" label="Agreement notes" /></>}{kind === "acquisition" && <><MoneyInput name="amount" label="Purchase price" /><Text name="date" label="Completion date" type="date" required /></>}{kind === "acquisition_cost" && <><Choice name="category" label="Category" values={["deposit", "purchase_tax", "legal", "survey_valuation", "mortgage_fee", "initial_refurbishment", "furniture_setup", "other"]} /><MoneyInput name="amount" label="Amount" /><Text name="date" label="Paid on" type="date" defaultValue={today} required /><Choice name="fundingSource" label="Funding source" values={["owner", "financed", "property_funds"]} /><OwnerSelect data={data} optional /><Text name="description" label="Description" /></>}{kind === "ledger" && <><OwnerSelect data={data} /><Choice name="entryType" label="Entry type" values={["initial_contribution", "additional_contribution", "owner_funded_expense", "capital_return", "profit_distribution", "drawing", "adjustment_in", "adjustment_out"]} /><MoneyInput name="amount" label="Amount" /><Text name="date" label="Date" type="date" defaultValue={today} required /><Text name="description" label="Description" /><Text name="reason" label="Reason (required for adjustment)" /></>}{kind === "valuation" && <><MoneyInput name="amount" label="Property value" /><Text name="date" label="Valuation date" type="date" defaultValue={today} required /><Choice name="source" label="Source" values={["purchase", "user", "professional", "estimated"]} /><Text name="notes" label="Notes / evidence reference" /></>}{kind === "loan" && <><Text name="name" label="Loan name" required /><Text name="lender" label="Lender" /><MoneyInput name="originalBalance" label="Original balance" /><MoneyInput name="openingBalance" label="Balance at start of records" /><MoneyInput name="monthlyPayment" label="Monthly payment" /><MoneyInput name="interestRate" label="Interest rate" suffix="%" /><Choice name="repaymentType" label="Repayment type" values={["repayment", "interest_only"]} /><Text name="date" label="Loan start" type="date" required /><Text name="endDate" label="Loan end" type="date" /><Text name="notes" label="Notes" /></>}{kind === "loan_event" && <><Choice name="loanId" label="Loan" values={data.loans.map((x) => x.id)} labels={Object.fromEntries(data.loans.map((x) => [x.id, x.name]))} /><Choice name="eventType" label="Event type" values={["principal_repayment", "additional_borrowing", "interest", "finance_cost", "refinance_in", "refinance_out", "balance_adjustment"]} /><MoneyInput name="amount" label="Amount" /><Text name="date" label="Date" type="date" defaultValue={today} required /><Text name="description" label="Description" /></>}{kind === "forecast" && <><MoneyInput name="expectedRent" label="Expected monthly rent" /><MoneyInput name="occupancy" label="Expected occupancy" suffix="%" defaultValue="95" /><MoneyInput name="rentGrowth" label="Annual rent growth" suffix="%" defaultValue="2" /><MoneyInput name="expenseInflation" label="Expense inflation" suffix="%" defaultValue="2" /><MoneyInput name="appreciation" label="Property appreciation" suffix="%" defaultValue="2" /><MoneyInput name="mortgageInterest" label="Mortgage interest" suffix="%" /><MoneyInput name="monthlyRepayment" label="Monthly repayment" /><Text name="horizon" label="Forecast horizon (months)" type="number" defaultValue="60" required /><MoneyInput name="targetReturn" label="Target annual return" suffix="%" /><MoneyInput name="targetLtv" label="Target refinance LTV" suffix="%" /><Text name="targetDate" label="Target recovery date" type="date" /></>}</div><DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save record"}</Button></DialogFooter></form>}</DialogContent></Dialog>;
}

function Text({ name, label, type = "text", ...props }: { name: string; label: string; type?: string } & React.InputHTMLAttributes<HTMLInputElement>) { return <Field label={label}><Input name={name} type={type} {...props} /></Field>; }
function MoneyInput({ name, label, suffix = "£", required = true, ...props }: { name: string; label: string; suffix?: string } & React.InputHTMLAttributes<HTMLInputElement>) { return <Field label={label}><div className="flex items-center gap-2"><span className="text-sm text-muted-foreground">{suffix}</span><Input name={name} type="number" min={suffix === "%" ? undefined : "0.01"} step="0.01" required={required} {...props} /></div></Field>; }
function Choice({ name, label, values, labels }: { name: string; label: string; values: string[]; labels?: Record<string, string> }) { return <Field label={label}><select name={name} className="h-9 rounded-md border bg-background px-3 text-sm" required>{values.map((value) => <option key={value} value={value}>{labels?.[value] ?? title(value)}</option>)}</select></Field>; }
function OwnerSelect({ data, optional = false }: { data: InvestmentDashboardDto; optional?: boolean }) { return <Field label={optional ? "Owner (when owner-funded)" : "Owner"}><select name="ownerId" className="h-9 rounded-md border bg-background px-3 text-sm" required={!optional}><option value="">{optional ? "None" : "Select owner"}</option>{data.owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></Field>; }
