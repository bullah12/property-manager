"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { formatMoney, Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiClientError } from "@/lib/api-client";
import { toDateOnly } from "@/lib/dates";
import { cn } from "@/lib/utils";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface IncomeCellDto {
  period: string;
  dueDate: string;
  expectedCents: number;
  receivedCents: number;
  status: "paid" | "upcoming" | "due" | "overdue" | "partial";
  daysLate: number | null;
  transactions: Array<{
    id: string;
    amountCents: number;
    occurredOn: string;
    description: string | null;
  }>;
}

interface IncomeRowDto {
  tenancy: {
    id: string;
    status: string;
    startDate: string;
    endDate: string | null;
    rentAmountCents: number;
    rentDueDay: number;
    tenant: { id: string; fullName: string } | null;
  };
  months: (IncomeCellDto | null)[];
  yearTotals: { expectedCents: number; receivedCents: number };
}

interface IncomeGridDto {
  year: number;
  today: string;
  graceDays: number;
  rows: IncomeRowDto[];
  monthTotals: Array<{ expectedCents: number; receivedCents: number }>;
}

const CELL_STYLES: Record<IncomeCellDto["status"], string> = {
  paid: "bg-emerald-50 border-emerald-300 text-emerald-900",
  partial: "bg-amber-50 border-amber-300 text-amber-900",
  overdue: "bg-red-50 border-red-300 text-red-900",
  due: "bg-amber-50/40 border-amber-200 text-amber-800",
  upcoming: "bg-muted/40 border-border text-muted-foreground",
};

export function IncomeTab({ propertyId }: { propertyId: string }) {
  const currentYear = new Date().getUTCFullYear();
  const [year, setYear] = useState(String(currentYear));

  const query = useQuery({
    queryKey: ["income", propertyId, year],
    queryFn: async () =>
      (await api.get<IncomeGridDto>(`/api/v1/properties/${propertyId}/income?year=${year}`))
        .data,
    staleTime: 30_000,
  });

  const years = Array.from({ length: 6 }, (_, i) => String(currentYear - i));
  const grid = query.data;

  const chartData = grid
    ? MONTH_LABELS.map((label, i) => ({
        month: label,
        Expected: grid.monthTotals[i].expectedCents / 100,
        Received: grid.monthTotals[i].receivedCents / 100,
      }))
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={y}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <LegendSwatch className="border-emerald-300 bg-emerald-50" label="Paid" />
          <LegendSwatch className="border-amber-300 bg-amber-50" label="Partial" />
          <LegendSwatch className="border-red-300 bg-red-50" label="Overdue" />
          <LegendSwatch className="border-border bg-muted/40" label="Not yet due" />
          <LegendSwatch className="border-dashed border-border bg-transparent" label="No tenancy" />
        </div>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-80 w-full" />
      ) : query.isError || !grid ? (
        <div className="text-sm text-muted-foreground">
          Failed to load income data.{" "}
          <button className="underline" onClick={() => query.refetch()}>
            Retry
          </button>
        </div>
      ) : grid.rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No tenancies overlap {year} — nothing to track.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Expected vs received ({year})</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => `£${v}`} />
                  <Tooltip formatter={(v) => `£${(v as number).toFixed(2)}`} />
                  <Legend />
                  <Bar dataKey="Expected" fill="var(--chart-3)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Received" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[1100px] border-collapse text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="sticky left-0 z-10 bg-muted/50 p-2 text-left font-medium">
                    Tenancy
                  </th>
                  {MONTH_LABELS.map((m) => (
                    <th key={m} className="p-2 text-center font-medium">
                      {m}
                    </th>
                  ))}
                  <th className="p-2 text-right font-medium">Year</th>
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((row) => (
                  <tr key={row.tenancy.id} className="border-t">
                    <td className="sticky left-0 z-10 bg-background p-2 align-top">
                      <div className="font-medium">
                        {row.tenancy.tenant?.fullName ?? "Tenant"}
                      </div>
                      <div className="text-muted-foreground">
                        <Money cents={row.tenancy.rentAmountCents} />
                        /mo · due {row.tenancy.rentDueDay}
                        {row.tenancy.status !== "active" ? ` · ${row.tenancy.status}` : ""}
                      </div>
                    </td>
                    {row.months.map((cell, i) => (
                      <td key={i} className="p-1 text-center align-top">
                        {cell ? (
                          <IncomeCellButton
                            cell={cell}
                            propertyId={propertyId}
                            tenancyId={row.tenancy.id}
                            year={grid.year}
                          />
                        ) : (
                          <div className="h-14 rounded border border-dashed border-border/60" />
                        )}
                      </td>
                    ))}
                    <td className="p-2 text-right align-top">
                      <div className="font-medium">
                        <Money cents={row.yearTotals.receivedCents} />
                      </div>
                      <div className="text-muted-foreground">
                        of <Money cents={row.yearTotals.expectedCents} />
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/30">
                  <td className="sticky left-0 z-10 bg-muted/30 p-2 font-medium">Totals</td>
                  {grid.monthTotals.map((t, i) => (
                    <td key={i} className="p-2 text-center">
                      {t.expectedCents > 0 ? (
                        <>
                          <div className="font-medium">
                            <Money cents={t.receivedCents} />
                          </div>
                          <div className="text-muted-foreground">
                            /<Money cents={t.expectedCents} />
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  ))}
                  <td className="p-2 text-right font-semibold">
                    <Money
                      cents={grid.rows.reduce((s, r) => s + r.yearTotals.receivedCents, 0)}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block size-3 rounded-sm border", className)} />
      {label}
    </span>
  );
}

function IncomeCellButton({
  cell,
  propertyId,
  tenancyId,
  year,
}: {
  cell: IncomeCellDto;
  propertyId: string;
  tenancyId: string;
  year: number;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const remainder = Math.max(cell.expectedCents - cell.receivedCents, 0);
  const [amount, setAmount] = useState((remainder / 100).toFixed(2));
  const [date, setDate] = useState(toDateOnly(new Date()));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["income", propertyId, String(year)] });
    queryClient.invalidateQueries({ queryKey: ["income", propertyId] });
    queryClient.invalidateQueries({ queryKey: ["transactions", propertyId] });
  };

  const recordPayment = async () => {
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || parseFloat(amount) <= 0) {
      toast.error("Amount must be pounds, e.g. 950.00");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/v1/transactions", {
        propertyId,
        tenancyId,
        direction: "income",
        category: "rent",
        amountCents: Math.round(parseFloat(amount) * 100),
        occurredOn: date,
        description: note || null,
        rentPeriod: cell.period,
      });
      toast.success("Payment recorded");
      invalidate();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to record payment");
    } finally {
      setBusy(false);
    }
  };

  const deletePayment = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/v1/transactions/${id}`),
    onSuccess: () => {
      toast.success("Payment removed");
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiClientError ? err.message : "Delete failed"),
  });

  const label =
    cell.status === "paid"
      ? formatMoney(cell.receivedCents)
      : cell.status === "partial"
        ? `${formatMoney(cell.receivedCents)} / ${formatMoney(cell.expectedCents)}`
        : formatMoney(cell.expectedCents);

  const sub =
    cell.status === "paid"
      ? (cell.transactions.at(-1)?.occurredOn ?? "")
      : cell.status === "overdue" || cell.status === "partial"
        ? `${cell.daysLate}d late`
        : `due ${cell.dueDate.slice(8, 10)}/${cell.dueDate.slice(5, 7)}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-14 w-full min-w-20 rounded border p-1 text-left transition-shadow hover:shadow",
            CELL_STYLES[cell.status]
          )}
        >
          <div className="text-[11px] font-semibold leading-tight">{label}</div>
          <div className="text-[10px] leading-tight opacity-80">{sub}</div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="center">
        <div className="space-y-3">
          <div className="text-sm font-medium">
            {MONTH_LABELS[parseInt(cell.period.slice(5, 7), 10) - 1]} {year} ·{" "}
            <span className="capitalize">{cell.status}</span>
          </div>
          {cell.transactions.length > 0 ? (
            <div className="space-y-1 rounded-md border p-2 text-xs">
              {cell.transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2">
                  <span>
                    <Money cents={t.amountCents} /> on {t.occurredOn}
                    {t.description ? ` — ${t.description}` : ""}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1 text-xs"
                    onClick={() => deletePayment.mutate(t.id)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
          {cell.status !== "paid" ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Amount £</Label>
                  <Input
                    value={amount}
                    inputMode="decimal"
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Received on</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Note (optional)</Label>
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <Button size="sm" className="w-full" onClick={recordPayment} disabled={busy}>
                {busy ? "Saving…" : "Record payment"}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Fully paid. Remove a payment above to correct a mis-entry.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
