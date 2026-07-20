"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, Loader2, Sparkles, Upload } from "lucide-react";
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
import { PanelLoading } from "@/components/panel-loading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { api, ApiClientError, uploadFile } from "@/lib/api-client";
import { toDateOnly } from "@/lib/dates";
import { useMe } from "@/hooks/use-me";
import type { ContractDto, JobDto, TenancyDto } from "@/lib/types";

export function ContractsTab({ propertyId }: { propertyId: string }) {
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [signTarget, setSignTarget] = useState<ContractDto | null>(null);

  const query = useQuery({
    queryKey: ["contracts", { propertyId }],
    queryFn: async () => {
      const tenancies = (
        await api.get<TenancyDto[]>(`/api/v1/tenancies?propertyId=${propertyId}&perPage=100`)
      ).data;
      const perTenancy = await Promise.all(
        tenancies.map(
          async (t) => (await api.get<ContractDto[]>(`/api/v1/tenancies/${t.id}/contracts`)).data
        )
      );
      const pendingJobs = generating
        ? (await api.get<JobDto[]>("/api/v1/jobs?status=pending&perPage=50")).data.filter(
            (j) => j.type === "contract.generate"
          )
        : [];
      const runningJobs = generating
        ? (await api.get<JobDto[]>("/api/v1/jobs?status=running&perPage=50")).data.filter(
            (j) => j.type === "contract.generate"
          )
        : [];
      return { tenancies, contracts: perTenancy.flat(), inFlight: pendingJobs.length + runningJobs.length };
    },
    // Poll while a generation job is in flight ("Generating…" row).
    refetchInterval: generating ? 1500 : false,
    staleTime: generating ? 0 : 30_000,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["contracts", { propertyId }] });

  if (generating && query.data && query.data.inFlight === 0) {
    setGenerating(false);
    toast.success("Contract generated");
  }

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

  if (query.isLoading) return <PanelLoading label="Loading contracts…" />;
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
      <PreTenancyDocumentsCard />
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Contracts</CardTitle>
              <CardDescription>
                Across all tenancies on this property — uploaded scans and
                generated leases.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setUploadOpen(true)}
                disabled={uploadableTenancies.length === 0}
              >
                <Upload className="size-4" /> Upload contract
              </Button>
              <Button
                size="sm"
                onClick={() => setGenerateOpen(true)}
                disabled={uploadableTenancies.length === 0 || generating}
              >
                <Sparkles className="size-4" /> Generate contract
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {contracts.length === 0 && !generating ? (
            <p className="text-sm text-muted-foreground">
              No contracts yet. Upload a scanned lease or generate one from the
              tenancy details.
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
                  {generating ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="size-4 animate-spin" /> Generating…
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : null}
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
      <GenerateContractDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        tenancies={uploadableTenancies}
        onQueued={() => {
          setGenerating(true);
          invalidate();
        }}
      />
      <SignContractDialog
        contract={signTarget}
        onOpenChange={(open) => !open && setSignTarget(null)}
        onDone={invalidate}
      />
    </div>
  );
}

const PRE_TENANCY_LINKS = [
  {
    title: "Written tenancy terms",
    timing: "Before the tenancy is agreed or signed",
    detail: "The generated agreement is intended to contain the prescribed written information for a standard assured periodic tenancy.",
    href: "https://www.gov.uk/assured-tenancy-agreements-a-guide-for-landlords/written-information-you-need-to-give-to-your-tenant",
  },
  {
    title: "Energy Performance Certificate (EPC)",
    timing: "At marketing and free of charge to the eventual tenant",
    detail: "Find and download the property-specific certificate from the official register.",
    href: "https://www.gov.uk/find-energy-certificate",
  },
  {
    title: "Gas safety record",
    timing: "Before the tenant moves in, where gas safety rules apply",
    detail: "Upload the property-specific record in Compliance; GOV.UK explains the landlord duties.",
    href: "https://www.gov.uk/private-renting/your-landlords-safety-responsibilities",
  },
  {
    title: "Electrical inspection report (EICR/EIC)",
    timing: "Before the new tenant occupies the property",
    detail: "Upload the latest satisfactory property-specific report in Compliance.",
    href: "https://www.gov.uk/government/publications/electrical-safety-standards-in-the-private-and-social-rented-sectors-guidance/electrical-safety-standards-in-the-private-and-social-rented-sectors-guidance",
  },
  {
    title: "Tenancy deposit prescribed information",
    timing: "Within 30 days of receiving a tenancy deposit",
    detail: "This is issued by or with the selected deposit scheme; it need not exist before the agreement is signed.",
    href: "https://www.gov.uk/deposit-protection-schemes-and-landlords",
  },
  {
    title: "Right to rent check",
    timing: "Before allowing an adult to occupy",
    detail: "This is a landlord check rather than a document to give the tenant.",
    href: "https://www.gov.uk/check-tenant-right-to-rent-documents",
  },
  {
    title: "Smoke and carbon monoxide alarms",
    timing: "Install as required and test on the first day",
    detail: "Record the check in Compliance; this is a safety action rather than a certificate to download.",
    href: "https://www.gov.uk/renting-out-a-property/landlord-responsibilities",
  },
  {
    title: "Local property licensing check",
    timing: "Before letting where a council scheme applies",
    detail: "Use the property postcode to check selective, additional or HMO licensing with the local council.",
    href: "https://www.gov.uk/find-local-council",
  },
] as const;

function PreTenancyDocumentsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Before the tenancy starts</CardTitle>
        <CardDescription>
          England checklist with authoritative government links. Property-specific
          certificates must be obtained from the relevant assessor or scheme.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 lg:grid-cols-2">
          {PRE_TENANCY_LINKS.map((item) => (
            <div key={item.title} className="rounded-md border p-3">
              <a
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium hover:underline"
              >
                {item.title} <ExternalLink className="size-3.5" />
              </a>
              <p className="mt-1 text-xs font-medium text-amber-700">{item.timing}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          The Renters&apos; Rights Act Information Sheet 2026 was primarily required for
          existing written tenancies created before 1 May 2026; it is not a substitute for
          the prescribed written terms for a new tenancy. {" "}
          <a
            href="https://www.gov.uk/government/publications/the-renters-rights-act-information-sheet-2026"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Open the official Information Sheet page
          </a>
          .
        </p>
      </CardContent>
    </Card>
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
                    {t.tenant?.fullName ?? "Tenant"} · from {t.startDate} · rolling ({t.status})
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

function GenerateContractDialog({
  open,
  onOpenChange,
  tenancies,
  onQueued,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenancies: TenancyDto[];
  onQueued: () => void;
}) {
  const { data: me } = useMe();
  const [tenancyId, setTenancyId] = useState("");
  const [pets, setPets] = useState(false);
  const [petsDescription, setPetsDescription] = useState("");
  const [garden, setGarden] = useState(false);
  const [gasSafetyApplies, setGasSafetyApplies] = useState(true);
  const [billsIncluded, setBillsIncluded] = useState(false);
  const [billsDescription, setBillsDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  // Clause toggles default from Settings (PLAN.md §4).
  if (me && !defaultsApplied) {
    setPets(me.settings.clausePetsDefault);
    setGarden(me.settings.clauseGardenDefault);
    setDefaultsApplied(true);
  }

  const submit = async () => {
    const target = tenancyId || tenancies[0]?.id;
    if (!target) return;
    if (pets && !petsDescription.trim()) {
      toast.error("Describe the pet(s) for the pets clause");
      return;
    }
    if (billsIncluded && !billsDescription.trim()) {
      toast.error("List the bills included in the rent");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/v1/tenancies/${target}/contracts/generate`, {
        kind: "lease",
        clauses: {
          pets,
          ...(pets ? { petsDescription: petsDescription.trim() } : {}),
          garden,
          gasSafetyApplies,
          billsIncluded,
          ...(billsIncluded ? { billsDescription: billsDescription.trim() } : {}),
        },
      });
      toast.success("Generation queued");
      onQueued();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to queue generation");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate contract</DialogTitle>
          <DialogDescription>
            Creates the England assured-periodic lease/v2 written statement as
            a draft PDF. Confirm the tenancy classification and property details first.
          </DialogDescription>
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
                    {t.tenant?.fullName ?? "Tenant"} · from {t.startDate} · rolling ({t.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            Use this generator only where the landlord does not live at the property,
            the property is the tenant&apos;s main home and no assured-tenancy exclusion
            applies. It is not suitable for lodgers, company or holiday lets, supported
            accommodation, purpose-built student accommodation, or tenancies linked to
            employment, agriculture, homelessness duties or a superior lease. Those cases
            can require different terms or prior possession-ground notices.
          </div>
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Checkbox checked={pets} onCheckedChange={(v) => setPets(!!v)} id="gen-pets" />
              <Label htmlFor="gen-pets" className="font-normal">
                Pets clause
              </Label>
            </div>
            {pets ? (
              <Input
                placeholder="e.g. one small dog (terrier)"
                value={petsDescription}
                onChange={(e) => setPetsDescription(e.target.value)}
              />
            ) : null}
            <div className="flex items-center gap-2">
              <Checkbox checked={garden} onCheckedChange={(v) => setGarden(!!v)} id="gen-garden" />
              <Label htmlFor="gen-garden" className="font-normal">
                Garden maintenance clause
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={gasSafetyApplies}
                onCheckedChange={(value) => setGasSafetyApplies(Boolean(value))}
                id="gen-gas"
              />
              <Label htmlFor="gen-gas" className="font-normal">
                Gas fittings or flues serve the property
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={billsIncluded}
                onCheckedChange={(value) => setBillsIncluded(Boolean(value))}
                id="gen-bills"
              />
              <Label htmlFor="gen-bills" className="font-normal">
                Rent includes bills
              </Label>
            </div>
            {billsIncluded ? (
              <Input
                placeholder="e.g. water and council tax"
                value={billsDescription}
                onChange={(event) => setBillsDescription(event.target.value)}
              />
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Queuing…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
