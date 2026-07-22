"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Plus } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Money } from "@/components/money";
import { PanelLoading } from "@/components/panel-loading";
import { StatusBadge } from "@/components/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProperty } from "@/hooks/use-property";
import { api, ApiClientError } from "@/lib/api-client";
import type { PropertyDetailDto } from "@/lib/types";

function TabLoadingSkeleton() {
  return <PanelLoading label="Loading tab…" />;
}

const TenancyTab = dynamic<{ propertyId: string }>(
  () => import("./tabs/tenancy-tab").then((module) => module.TenancyTab),
  { loading: TabLoadingSkeleton }
);
const ContractsTab = dynamic<{ propertyId: string }>(
  () => import("./tabs/contracts-tab").then((module) => module.ContractsTab),
  { loading: TabLoadingSkeleton }
);
const IncomeTab = dynamic<{ propertyId: string }>(
  () => import("./tabs/income-tab").then((module) => module.IncomeTab),
  { loading: TabLoadingSkeleton }
);
const ExpensesTab = dynamic<{ propertyId: string }>(
  () => import("./tabs/expenses-tab").then((module) => module.ExpensesTab),
  { loading: TabLoadingSkeleton }
);
const NotificationsTab = dynamic<{ propertyId: string; propertyNickname?: string }>(
  () => import("./tabs/notifications-tab").then((module) => module.NotificationsTab),
  { loading: TabLoadingSkeleton }
);
const OwnershipTab = dynamic<{ propertyId: string; ownershipStatus: PropertyDetailDto["ownershipStatus"] }>(() => import("./tabs/ownership-tab").then((module) => module.OwnershipTab), {
  loading: TabLoadingSkeleton,
});
const TABS = ["ownership", "contracts", "income", "expenses", "notifications", "tenancy"] as const;
type TabKey = (typeof TABS)[number];

export function PropertyDetail({ id }: { id: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: property, isLoading, isError, refetch } = useProperty(id);

  const rawTab = searchParams.get("tab");
  const tab: TabKey = TABS.includes(rawTab as TabKey) ? (rawTab as TabKey) : "contracts";

  const archiveMutation = useMutation({
    mutationFn: async (action: "archive" | "unarchive") =>
      (await api.post<PropertyDetailDto>(`/api/v1/properties/${id}/${action}`)).data,
    onSuccess: (_data, action) => {
      queryClient.invalidateQueries({ queryKey: ["property", id] });
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      toast.success(action === "archive" ? "Property archived" : "Property restored");
    },
    onError: (err) =>
      toast.error(err instanceof ApiClientError ? err.message : "Action failed"),
  });

  return (
    <div className="space-y-6">
      {isLoading ? (
        <PropertySummarySkeleton />
      ) : isError || !property ? (
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          Property summary could not be loaded.{" "}
          <button className="underline" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Header band */}
          <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">{property.nickname}</h2>
            <StatusBadge status={property.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {property.addressLine1}
            {property.addressLine2 ? `, ${property.addressLine2}` : ""}, {property.city}{" "}
            {property.postcode} ·{" "}
            <span className="capitalize">{property.propertyType}</span>
            {property.bedrooms != null ? ` · ${property.bedrooms} bed` : ""}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Main landlord: {property.ownershipStatus === "pending" ? "Pending confirmation" : property.mainLandlord?.fullName ?? "Not set"}
            {property.mainLandlord?.email ? ` · ${property.mainLandlord.email}` : ""}
            {property.mainLandlord?.phone ? ` · ${property.mainLandlord.phone}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/properties/${id}/edit`}>
              <Pencil className="size-4" /> Edit
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/tenancies/new?propertyId=${id}`}>
              <Plus className="size-4" /> New tenancy
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {property.status === "active" ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Archive className="mr-2 size-4" /> Archive property
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Archive “{property.nickname}”?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        The property is hidden from the default list but nothing is
                        deleted. You can unarchive it later.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => archiveMutation.mutate("archive")}>
                        Archive
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <DropdownMenuItem onClick={() => archiveMutation.mutate("unarchive")}>
                  <ArchiveRestore className="mr-2 size-4" /> Unarchive property
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

          {/* Mini-stats */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat
          label={property.incomeBasis === "owner_share" ? "Your monthly income" : "Monthly property income"}
          value={
            property.currentMonthlyIncomeCents != null ? (
              <>
                <Money cents={property.currentMonthlyIncomeCents} />
                <span className="text-sm font-normal text-muted-foreground"> /month</span>
              </>
            ) : (
              "Not recorded"
            )
          }
        />
        <MiniStat
          label="Potential monthly income"
          value={
            property.potentialMonthlyIncomeCents != null ? (
              <>
                <Money cents={property.potentialMonthlyIncomeCents} />
                <span className="text-sm font-normal text-muted-foreground"> /month</span>
              </>
            ) : (
              "Not recorded"
            )
          }
        />
        <MiniStat
          label="Ownership confidence"
          value={<span className="capitalize">{property.ownershipStatus}</span>}
        />
        <MiniStat
          label="YTD expenses"
          value={<Money cents={property.stats.ytdExpensesCents} />}
        />
          </div>
          {property.notes ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-950">
              <p className="font-medium">Workbook source notes</p>
              <p className="mt-1 whitespace-pre-wrap">{property.notes}</p>
            </div>
          ) : null}
        </>
      )}

      {/* Tab strip (URL-addressable) */}
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(searchParams.toString());
          next.set("tab", value);
          window.history.replaceState(null, "", `${pathname}?${next.toString()}`);
        }}
      >
        <TabsList className="flex-wrap">
          <TabsTrigger value="tenancy">Tenancy</TabsTrigger>
          <TabsTrigger value="ownership">Ownership</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="income">Monthly Income</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="notifications">Compliance</TabsTrigger>
        </TabsList>
        <TabsContent value="tenancy">
          <TenancyTab propertyId={id} />
        </TabsContent>
        <TabsContent value="ownership">
          {property ? (
            <OwnershipTab
              propertyId={id}
              ownershipStatus={property.ownershipStatus}
            />
          ) : null}
        </TabsContent>
        <TabsContent value="contracts">
          <ContractsTab propertyId={id} />
        </TabsContent>
        <TabsContent value="income">
          <IncomeTab propertyId={id} />
        </TabsContent>
        <TabsContent value="expenses">
          <ExpensesTab propertyId={id} />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationsTab propertyId={id} propertyNickname={property?.nickname} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PropertySummarySkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading property summary">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
