"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Paperclip, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { toast } from "sonner";
import { DateDisplay } from "@/components/date-display";
import { formatMoney, Money } from "@/components/money";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiClientError, uploadFile } from "@/lib/api-client";
import { toDateOnly } from "@/lib/dates";
import type { PropertyDetailDto, TransactionDto } from "@/lib/types";

const CATEGORIES = [
  "repairs",
  "maintenance",
  "insurance",
  "mortgage_interest",
  "certificates",
  "agent_fees",
  "utilities",
  "other",
] as const;

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "#8884d8",
  "#82ca9d",
  "#d0ed57",
];

function categoryLabel(c: string) {
  return c.replace(/_/g, " ");
}

export function ExpensesTab({ property }: { property: PropertyDetailDto }) {
  const queryClient = useQueryClient();
  const currentYear = new Date().getUTCFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [category, setCategory] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TransactionDto | null>(null);

  const apiQuery = new URLSearchParams({
    propertyId: property.id,
    direction: "expense",
    year,
    perPage: "100",
  });
  if (category !== "all") apiQuery.set("category", category);

  const query = useQuery({
    queryKey: ["transactions", property.id, "expenses", year, category],
    queryFn: async () =>
      (await api.get<TransactionDto[]>(`/api/v1/transactions?${apiQuery.toString()}`)).data,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["transactions", property.id] });
    queryClient.invalidateQueries({ queryKey: ["property", property.id] });
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/v1/transactions/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success("Expense deleted");
    },
    onError: (err) =>
      toast.error(err instanceof ApiClientError ? err.message : "Delete failed"),
  });

  const donutData = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const t of query.data ?? []) {
      byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amountCents);
    }
    return [...byCategory.entries()].map(([name, cents]) => ({
      name: categoryLabel(name),
      value: cents,
    }));
  }, [query.data]);

  const openReceipt = async (fileId: string) => {
    try {
      const { data } = await api.get<{ url: string }>(`/api/v1/files/${fileId}/download`);
      window.open(data.url, "_blank");
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not open receipt");
    }
  };

  const years = Array.from({ length: 6 }, (_, i) => String(currentYear - i));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
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
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c} className="capitalize">
                {categoryLabel(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button
          variant="outline"
          onClick={() =>
            window.open(
              `/api/v1/reports/expenses?year=${year}&format=csv&propertyId=${property.id}`,
              "_blank"
            )
          }
        >
          <Download className="size-4" /> Export CSV
        </Button>
        <Button onClick={() => setShowForm((s) => !s)}>
          <Plus className="size-4" /> Add expense
        </Button>
      </div>

      {showForm ? (
        <AddExpenseForm
          propertyId={property.id}
          onDone={() => {
            setShowForm(false);
            invalidate();
          }}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {query.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : query.isError ? (
            <div className="text-sm text-muted-foreground">
              Failed to load expenses.{" "}
              <button className="underline" onClick={() => query.refetch()}>
                Retry
              </button>
            </div>
          ) : (query.data ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No expenses recorded for {year}
                {category !== "all" ? ` in ${categoryLabel(category)}` : ""}.
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Receipt</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(query.data ?? []).map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <DateDisplay iso={t.occurredOn} />
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {categoryLabel(t.category)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-64 truncate text-muted-foreground">
                        {t.description ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <Money cents={t.amountCents} />
                      </TableCell>
                      <TableCell className="text-right">
                        {t.receiptFileId ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openReceipt(t.receiptFileId!)}
                            aria-label="Open receipt"
                          >
                            <Paperclip className="size-4" />
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(t)}
                          aria-label="Delete"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3} className="font-medium">
                      Total
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      <Money
                        cents={(query.data ?? []).reduce((s, t) => s + t.amountCents, 0)}
                      />
                    </TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By category ({year})</CardTitle>
            <CardDescription>Expense breakdown for the selected year.</CardDescription>
          </CardHeader>
          <CardContent>
            {donutData.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing to chart.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {donutData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatMoney(v as number)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `${categoryLabel(deleteTarget.category)} · ${formatMoney(deleteTarget.amountCents)} on ${deleteTarget.occurredOn}. Hard delete — cannot be undone.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddExpenseForm({
  propertyId,
  onDone,
}: {
  propertyId: string;
  onDone: () => void;
}) {
  const [category, setCategory] = useState<string>("repairs");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(toDateOnly(new Date()));
  const [description, setDescription] = useState("");
  const [receipt, setReceipt] = useState<globalThis.File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      toast.error("Amount must be pounds, e.g. 120.50");
      return;
    }
    setBusy(true);
    try {
      let receiptFileId: string | undefined;
      if (receipt) {
        receiptFileId = (await uploadFile("receipt", receipt)).data.id;
      }
      await api.post("/api/v1/transactions", {
        propertyId,
        direction: "expense",
        category,
        amountCents: Math.round(parseFloat(amount) * 100),
        occurredOn: date,
        description: description || null,
        receiptFileId: receiptFileId ?? null,
      });
      toast.success("Expense recorded");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to record expense");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add expense</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {categoryLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="expense-amount">Amount £</Label>
            <Input
              id="expense-amount"
              inputMode="decimal"
              placeholder="120.50"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expense-date">Date</Label>
            <Input
              id="expense-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="expense-desc">Description (optional)</Label>
          <Textarea
            id="expense-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expense-receipt">Receipt (optional PDF/JPEG/PNG, ≤10 MB)</Label>
          <Input
            id="expense-receipt"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
          />
        </div>
        <Button onClick={submit} disabled={busy || !amount}>
          {busy ? "Saving…" : "Record expense"}
        </Button>
      </CardContent>
    </Card>
  );
}
