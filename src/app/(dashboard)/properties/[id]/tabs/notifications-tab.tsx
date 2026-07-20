"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  BadgeCheck,
  ExternalLink,
  FileCheck,
  Flame,
  Home,
  Plus,
  ShieldCheck,
  Trash2,
  Zap,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DateDisplay } from "@/components/date-display";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { api, ApiClientError, uploadFile } from "@/lib/api-client";
import { toDateOnly } from "@/lib/dates";
import type { ComplianceItemDto, ComplianceKind, PropertyDetailDto } from "@/lib/types";

const KIND_META: Record<ComplianceKind, { label: string; icon: React.ReactNode; recurrence: number | null }> = {
  gas_certificate: { label: "Gas certificate", icon: <Flame className="size-4" />, recurrence: 12 },
  electrical_eicr: { label: "Electrical EICR", icon: <Zap className="size-4" />, recurrence: 60 },
  epc: { label: "EPC", icon: <FileCheck className="size-4" />, recurrence: 120 },
  smoke_co_check: { label: "Smoke & CO check", icon: <ShieldCheck className="size-4" />, recurrence: 12 },
  selective_licence: { label: "Selective licence", icon: <BadgeCheck className="size-4" />, recurrence: null },
  inspection: { label: "Inspection", icon: <Home className="size-4" />, recurrence: null },
  insurance: { label: "Insurance", icon: <ShieldCheck className="size-4" />, recurrence: 12 },
  custom: { label: "Custom", icon: <CalendarClock className="size-4" />, recurrence: null },
};

/** Client-computed status chip (PLAN.md §4): ok / due soon ≤30d / overdue. */
function chipFor(item: ComplianceItemDto, today: string): string {
  if (item.completedOn) return "completed";
  if (item.dueOn < today) return "overdue";
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() + 30);
  if (item.dueOn <= toDateOnly(cutoff)) return "due soon";
  return "ok";
}

export function NotificationsTab({ property }: { property: PropertyDetailDto }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<ComplianceItemDto | null>(null);
  const [editTarget, setEditTarget] = useState<ComplianceItemDto | null>(null);

  // Flow 1: property create redirects here with ?setup=1.
  useEffect(() => {
    if (searchParams.get("setup") === "1") {
      setSetupOpen(true);
      router.replace(`${pathname}?tab=notifications`);
    }
  }, [searchParams, router, pathname]);

  const query = useQuery({
    queryKey: ["compliance", property.id],
    queryFn: async () =>
      (
        await api.get<{ today: string; items: ComplianceItemDto[] }>(
          `/api/v1/properties/${property.id}/compliance`
        )
      ).data,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["compliance", property.id] });
    queryClient.invalidateQueries({ queryKey: ["property", property.id] });
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/v1/compliance-items/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success("Compliance item removed");
    },
    onError: (err) =>
      toast.error(err instanceof ApiClientError ? err.message : "Delete failed"),
  });

  const openDocument = async (fileId: string) => {
    try {
      const { data } = await api.get<{ url: string }>(`/api/v1/files/${fileId}/download`);
      window.open(data.url, "_blank");
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not open document");
    }
  };

  if (query.isLoading) return <Skeleton className="h-64 w-full" />;
  if (query.isError || !query.data) {
    return (
      <div className="text-sm text-muted-foreground">
        Failed to load compliance items.{" "}
        <button className="underline" onClick={() => query.refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const { today, items } = query.data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Compliance & deadlines</CardTitle>
              <CardDescription>
                Certificates, inspections and other dated obligations for this
                property, including local selective licensing where it applies.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" /> Add compliance item
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="space-y-3 py-6 text-center text-sm text-muted-foreground">
              <p>No compliance items yet.</p>
              <Button variant="outline" size="sm" onClick={() => setSetupOpen(true)}>
                Add UK defaults (gas / EICR / EPC)
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Recurrence</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Next reminder</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const chip = chipFor(item, today);
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {KIND_META[item.kind]?.icon}
                            <span className="font-medium">{item.label}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <DateDisplay iso={item.completedOn ?? item.dueOn} />
                          {item.completedOn ? (
                            <span className="text-xs text-muted-foreground"> (done)</span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={chip} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.recurrenceMonths ? `every ${item.recurrenceMonths} months` : "one-off"}
                        </TableCell>
                        <TableCell>
                          {item.documentFileId ? (
                            <button
                              className="text-sm underline"
                              onClick={() => openDocument(item.documentFileId!)}
                            >
                              View
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.reminder?.nextFire
                            ? `${item.reminder.nextFire.lead}-day lead on ${item.reminder.nextFire.fireOn}`
                            : item.completedOn
                              ? "—"
                              : "none scheduled"}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {!item.completedOn ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCompleteTarget(item)}
                              >
                                Mark complete
                              </Button>
                            ) : null}
                            <Button variant="ghost" size="sm" onClick={() => setEditTarget(item)}>
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="Delete"
                              onClick={() => deleteMutation.mutate(item.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AddItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        propertyId={property.id}
        onDone={invalidate}
      />
      <UkDefaultsDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        propertyId={property.id}
        propertyNickname={property.nickname}
        onDone={invalidate}
      />
      <CompleteDialog
        item={completeTarget}
        onOpenChange={(open) => !open && setCompleteTarget(null)}
        onDone={invalidate}
      />
      <EditDialog
        item={editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        onDone={invalidate}
      />
    </div>
  );
}

function AddItemDialog({
  open,
  onOpenChange,
  propertyId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<ComplianceKind>("gas_certificate");
  const [label, setLabel] = useState(KIND_META.gas_certificate.label);
  const [dueOn, setDueOn] = useState("");
  const [recurrence, setRecurrence] = useState("12");
  const [busy, setBusy] = useState(false);

  const pickKind = (k: ComplianceKind) => {
    setKind(k);
    setLabel(KIND_META[k].label);
    setRecurrence(KIND_META[k].recurrence ? String(KIND_META[k].recurrence) : "");
  };

  const submit = async () => {
    if (!dueOn || !label) {
      toast.error("Label and due date are required");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/v1/compliance-items", {
        propertyId,
        kind,
        label,
        dueOn,
        recurrenceMonths: recurrence === "" ? null : parseInt(recurrence, 10),
      });
      toast.success("Compliance item added");
      onDone();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to add item");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add compliance item</DialogTitle>
          <DialogDescription>
            Kind presets fill common cadences. Selective-licence expiry and renewal
            rules come from the council that issued it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={(v) => pickKind(v as ComplianceKind)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_META) as ComplianceKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_META[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {kind === "selective_licence" ? (
              <p className="text-xs text-muted-foreground">
                Licensing areas and conditions are council-specific. {" "}
                <a
                  href="https://www.gov.uk/find-local-council"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline"
                >
                  Find the property&apos;s council <ExternalLink className="size-3" />
                </a>
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ci-label">Label</Label>
            <Input id="ci-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ci-due">Due on</Label>
              <Input id="ci-due" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ci-rec">Recurrence (months, empty = one-off)</Label>
              <Input
                id="ci-rec"
                type="number"
                min={1}
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Adding…" : "Add item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Flow 1: after property create — England presets (gas 12 / EICR 60 / EPC 120). */
function UkDefaultsDialog({
  open,
  onOpenChange,
  propertyId,
  propertyNickname,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  propertyNickname: string;
  onDone: () => void;
}) {
  const inTwelveMonths = () => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    return toDateOnly(d);
  };
  const [rows, setRows] = useState([
    { kind: "gas_certificate" as ComplianceKind, checked: true, dueOn: inTwelveMonths(), recurrence: 12 },
    { kind: "electrical_eicr" as ComplianceKind, checked: true, dueOn: inTwelveMonths(), recurrence: 60 },
    { kind: "epc" as ComplianceKind, checked: true, dueOn: inTwelveMonths(), recurrence: 120 },
  ]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      for (const row of rows.filter((r) => r.checked)) {
        await api.post("/api/v1/compliance-items", {
          propertyId,
          kind: row.kind,
          label: KIND_META[row.kind].label,
          dueOn: row.dueOn,
          recurrenceMonths: row.recurrence,
        });
      }
      toast.success("Compliance items added");
      onDone();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to add items");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add compliance items?</DialogTitle>
          <DialogDescription>
            Common England obligations for {propertyNickname}. Adjust each first due
            date — the certificate&apos;s current expiry is the right value.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={row.kind} className="flex items-center gap-3 rounded-md border p-3">
              <Checkbox
                checked={row.checked}
                onCheckedChange={(v) =>
                  setRows((rs) => rs.map((r, j) => (j === i ? { ...r, checked: !!v } : r)))
                }
              />
              <div className="flex-1">
                <div className="text-sm font-medium">{KIND_META[row.kind].label}</div>
                <div className="text-xs text-muted-foreground">
                  every {row.recurrence} months
                </div>
              </div>
              <Input
                type="date"
                className="w-40"
                value={row.dueOn}
                onChange={(e) =>
                  setRows((rs) => rs.map((r, j) => (j === i ? { ...r, dueOn: e.target.value } : r)))
                }
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Skip
          </Button>
          <Button onClick={submit} disabled={busy || rows.every((r) => !r.checked)}>
            {busy ? "Adding…" : "Add selected"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteDialog({
  item,
  onOpenChange,
  onDone,
}: {
  item: ComplianceItemDto | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [completedOn, setCompletedOn] = useState(toDateOnly(new Date()));
  const [file, setFile] = useState<globalThis.File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!item) return;
    setBusy(true);
    try {
      let fileId: string | undefined;
      if (file) fileId = (await uploadFile("certificate", file)).data.id;
      await api.post(`/api/v1/compliance-items/${item.id}/complete`, {
        completedOn,
        fileId,
      });
      toast.success(
        item.recurrenceMonths
          ? "Completed — due date rolled forward"
          : "Marked complete"
      );
      onDone();
      onOpenChange(false);
      setFile(null);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to complete");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark “{item?.label}” complete</DialogTitle>
          <DialogDescription>
            {item?.recurrenceMonths
              ? `Recurring every ${item.recurrenceMonths} months — the due date rolls forward from the completion date.`
              : "One-off item — completing it removes its reminder."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="comp-date">Completed on</Label>
            <Input
              id="comp-date"
              type="date"
              value={completedOn}
              onChange={(e) => setCompletedOn(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="comp-file">New certificate (optional PDF/JPEG/PNG)</Label>
            <Input
              id="comp-file"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !completedOn}>
            {busy ? "Saving…" : "Mark complete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  item,
  onOpenChange,
  onDone,
}: {
  item: ComplianceItemDto | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [label, setLabel] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [recurrence, setRecurrence] = useState("");
  const [leadDays, setLeadDays] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (item) {
      setLabel(item.label);
      setDueOn(item.dueOn);
      setRecurrence(item.recurrenceMonths ? String(item.recurrenceMonths) : "");
      setLeadDays(item.reminder?.leadDays.join(", ") ?? "");
    }
  }, [item]);

  const submit = async () => {
    if (!item) return;
    setBusy(true);
    try {
      await api.patch(`/api/v1/compliance-items/${item.id}`, {
        label,
        dueOn,
        recurrenceMonths: recurrence === "" ? null : parseInt(recurrence, 10),
      });
      if (item.reminder && leadDays.trim()) {
        const parsed = leadDays.split(",").map((s) => parseInt(s.trim(), 10));
        if (parsed.some((n) => Number.isNaN(n))) {
          toast.error("Lead days must be numbers, e.g. 60, 30, 7");
          setBusy(false);
          return;
        }
        await api.patch(`/api/v1/reminders/${item.reminder.id}`, { leadDays: parsed });
      }
      toast.success("Item updated");
      onDone();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit compliance item</DialogTitle>
          <DialogDescription>
            Changing the due date resets the reminder ladder — the next scan
            re-derives what to send.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-label">Label</Label>
            <Input id="edit-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-due">Due on</Label>
              <Input
                id="edit-due"
                type="date"
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-rec">Recurrence (months)</Label>
              <Input
                id="edit-rec"
                type="number"
                min={1}
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
              />
            </div>
          </div>
          {item?.reminder ? (
            <div className="space-y-2">
              <Label htmlFor="edit-leads">Reminder lead days (override)</Label>
              <Input
                id="edit-leads"
                placeholder="60, 30, 7"
                value={leadDays}
                onChange={(e) => setLeadDays(e.target.value)}
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !label || !dueOn}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
