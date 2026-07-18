"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DateDisplay } from "@/components/date-display";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import type { ContractDto, PropertyDetailDto, TenancyDto } from "@/lib/types";

export function ContractsTab({ property }: { property: PropertyDetailDto }) {
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [signTarget, setSignTarget] = useState<ContractDto | null>(null);

  const query = useQuery({
    queryKey: ["contracts", { propertyId: property.id }],
    queryFn: async () => {
      const tenancies = (
        await api.get<TenancyDto[]>(`/api/v1/tenancies?propertyId=${property.id}&perPage=100`)
      ).data;
      const perTenancy = await Promise.all(
        tenancies.map(
          async (t) => (await api.get<ContractDto[]>(`/api/v1/tenancies/${t.id}/contracts`)).data
        )
      );
      return { tenancies, contracts: perTenancy.flat() };
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["contracts", { propertyId: property.id }] });

  const download = async (fileId: string) => {
    try {
      const { data } = await api.get<{ url: string }>(`/api/v1/files/${fileId}/download`);
      window.open(data.url, "_blank");
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Download failed");
    }
  };

  const transition = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "issue" | "supersede" }) =>
      (await api.post<ContractDto>(`/api/v1/contracts/${id}/${action}`)).data,
    onSuccess: (_d, { action }) => {
      invalidate();
      toast.success(action === "issue" ? "Contract issued" : "Contract superseded");
    },
    onError: (err) =>
      toast.error(err instanceof ApiClientError ? err.message : "Action failed"),
  });

  if (query.isLoading) return <Skeleton className="h-64 w-full" />;
  if (query.isError) {
    return (
      <div className="text-sm text-muted-foreground">
        Failed to load contracts.{" "}
        <button className="underline" onClick={() => query.refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const { tenancies = [], contracts = [] } = query.data ?? {};
  const uploadableTenancies = tenancies.filter(
    (t) => t.status === "draft" || t.status === "active"
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Contracts</CardTitle>
              <CardDescription>
                Across all tenancies on this property. Generated leases arrive in
                Phase 9 — uploads work now.
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => setUploadOpen(true)}
              disabled={uploadableTenancies.length === 0}
            >
              <Upload className="size-4" /> Upload contract
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {contracts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No contracts yet. Upload a scanned lease to get started.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kind</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Signed on</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contracts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="capitalize">{c.kind}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {c.source}
                        </Badge>
                      </TableCell>
                      <TableCell>{c.tenancy?.tenant?.fullName ?? "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={c.status} />
                      </TableCell>
                      <TableCell>
                        <DateDisplay iso={c.signedOn} />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => download(c.fileId)}
                            aria-label="Download"
                          >
                            <Download className="size-4" />
                          </Button>
                          {c.status === "draft" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => transition.mutate({ id: c.id, action: "issue" })}
                            >
                              Mark issued
                            </Button>
                          ) : null}
                          {c.status === "draft" || c.status === "issued" ? (
                            <Button variant="outline" size="sm" onClick={() => setSignTarget(c)}>
                              Mark signed
                            </Button>
                          ) : null}
                          {c.status !== "superseded" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => transition.mutate({ id: c.id, action: "supersede" })}
                            >
                              Supersede
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <UploadContractDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        tenancies={uploadableTenancies}
        onDone={invalidate}
      />
      <SignContractDialog
        contract={signTarget}
        onOpenChange={(open) => !open && setSignTarget(null)}
        onDone={invalidate}
      />
    </div>
  );
}

function UploadContractDialog({
  open,
  onOpenChange,
  tenancies,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenancies: TenancyDto[];
  onDone: () => void;
}) {
  const [tenancyId, setTenancyId] = useState("");
  const [kind, setKind] = useState<"lease" | "renewal" | "addendum">("lease");
  const [file, setFile] = useState<globalThis.File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const target = tenancyId || tenancies[0]?.id;
    if (!file || !target) return;
    setBusy(true);
    try {
      const uploaded = await uploadFile("lease-doc", file);
      await api.post(`/api/v1/tenancies/${target}/contracts`, {
        fileId: uploaded.data.id,
        kind,
      });
      toast.success("Contract uploaded as draft");
      onDone();
      onOpenChange(false);
      setFile(null);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload contract</DialogTitle>
          <DialogDescription>PDF only, max 25 MB. Attached as a draft.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tenancy</Label>
            <Select value={tenancyId || tenancies[0]?.id || ""} onValueChange={setTenancyId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick a tenancy" />
              </SelectTrigger>
              <SelectContent>
                {tenancies.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.tenant?.fullName ?? "Tenant"} · {t.startDate} → {t.endDate} ({t.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lease">Lease</SelectItem>
                <SelectItem value="renewal">Renewal</SelectItem>
                <SelectItem value="addendum">Addendum</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contract-file">PDF file</Label>
            <Input
              id="contract-file"
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !file}>
            {busy ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SignContractDialog({
  contract,
  onOpenChange,
  onDone,
}: {
  contract: ContractDto | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [signedOn, setSignedOn] = useState(toDateOnly(new Date()));
  const [file, setFile] = useState<globalThis.File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!contract) return;
    setBusy(true);
    try {
      let fileId: string | undefined;
      if (file) {
        fileId = (await uploadFile("lease-doc", file)).data.id;
      }
      await api.post(`/api/v1/contracts/${contract.id}/sign`, { signedOn, fileId });
      toast.success("Contract marked signed");
      onDone();
      onOpenChange(false);
      setFile(null);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to sign");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!contract} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark contract signed</DialogTitle>
          <DialogDescription>
            Optionally attach the wet-signed scan (replaces the current file).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="signed-on">Signed on</Label>
            <Input
              id="signed-on"
              type="date"
              value={signedOn}
              onChange={(e) => setSignedOn(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signed-file">Signed copy (optional PDF)</Label>
            <Input
              id="signed-file"
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !signedOn}>
            {busy ? "Saving…" : "Mark signed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
