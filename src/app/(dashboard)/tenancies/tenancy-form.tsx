"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMe } from "@/hooks/use-me";
import { api, ApiClientError } from "@/lib/api-client";
import type { PropertyDto, TenancyDto, TenantDto } from "@/lib/types";

const formSchema = z.object({
  propertyId: z.string().min(1, "Pick a property"),
  tenantMode: z.enum(["existing", "new"]),
  tenantId: z.string(),
  newTenantName: z.string().trim().max(200),
  newTenantEmail: z.union([
    z.literal(""),
    z.string().trim().toLowerCase().pipe(z.email("Invalid email")),
  ]),
  newTenantPhone: z.string().trim().max(50),
  startDate: z.string().min(1, "Required"),
  rentAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Amount in pounds, e.g. 950.00"),
  rentDueDay: z.string().regex(/^\d+$/, "Day of month 1–28"),
  depositAmount: z.string().regex(/^(\d+(\.\d{1,2})?)?$/, "Amount in pounds"),
  depositScheme: z.string().trim().max(200),
  depositReference: z.string().trim().max(200),
  clausePets: z.boolean(),
  clauseGarden: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface TenancyFormProps {
  /** Pre-select a property (from ?propertyId=). */
  initialPropertyId?: string;
  /** Edit mode: an existing draft tenancy. */
  tenancy?: TenancyDto;
}

export function TenancyForm({ initialPropertyId, tenancy }: TenancyFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const isEdit = !!tenancy;
  const [error, setError] = useState<string | null>(null);

  const propertiesQuery = useQuery({
    queryKey: ["properties", "for-tenancy-form"],
    queryFn: () =>
      api.get<PropertyDto[]>("/api/v1/properties?status=active&perPage=100&sort=nickname"),
  });
  const tenantsQuery = useQuery({
    queryKey: ["tenants", "for-tenancy-form"],
    queryFn: () => api.get<TenantDto[]>("/api/v1/tenants?perPage=100&sort=full_name"),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      propertyId: tenancy?.propertyId ?? initialPropertyId ?? "",
      tenantMode: "existing",
      tenantId: tenancy?.tenantId ?? "",
      newTenantName: "",
      newTenantEmail: "",
      newTenantPhone: "",
      startDate: tenancy?.startDate ?? "",
      rentAmount: tenancy ? (tenancy.rentAmountCents / 100).toFixed(2) : "",
      rentDueDay: tenancy ? String(tenancy.rentDueDay) : "1",
      depositAmount:
        tenancy?.depositAmountCents != null
          ? (tenancy.depositAmountCents / 100).toFixed(2)
          : "",
      depositScheme: tenancy?.depositScheme ?? "",
      depositReference: tenancy?.depositReference ?? "",
      clausePets: me?.settings.clausePetsDefault ?? false,
      clauseGarden: me?.settings.clauseGardenDefault ?? false,
    },
  });

  const tenantMode = form.watch("tenantMode");

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      setError(null);
      const rentDueDay = parseInt(values.rentDueDay, 10);
      if (rentDueDay < 1 || rentDueDay > 28) {
        throw new ApiClientError("VALIDATION_ERROR", "Rent due day must be between 1 and 28");
      }

      let tenantId = values.tenantId;
      if (!isEdit && values.tenantMode === "new") {
        if (!values.newTenantName) {
          throw new ApiClientError("VALIDATION_ERROR", "New tenant needs a name");
        }
        const created = await api.post<TenantDto>("/api/v1/tenants", {
          fullName: values.newTenantName,
          email: values.newTenantEmail || null,
          phone: values.newTenantPhone || null,
        });
        tenantId = created.data.id;
      }
      if (!isEdit && !tenantId) {
        throw new ApiClientError("VALIDATION_ERROR", "Pick or create a tenant");
      }

      const shared = {
        startDate: values.startDate,
        endDate: null,
        rentAmountCents: Math.round(parseFloat(values.rentAmount) * 100),
        rentDueDay,
        depositAmountCents:
          values.depositAmount === ""
            ? null
            : Math.round(parseFloat(values.depositAmount) * 100),
        depositScheme: values.depositScheme || null,
        depositReference: values.depositReference || null,
      };

      if (isEdit) {
        return (await api.patch<TenancyDto>(`/api/v1/tenancies/${tenancy.id}`, shared)).data;
      }
      return (
        await api.post<TenancyDto>("/api/v1/tenancies", {
          propertyId: values.propertyId,
          tenantId,
          ...shared,
        })
      ).data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tenancies"] });
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      queryClient.invalidateQueries({ queryKey: ["property", data.propertyId] });
      toast.success(isEdit ? "Tenancy updated" : "Draft tenancy created");
      router.push(`/properties/${data.propertyId}?tab=tenancy`);
    },
    onError: (err) => {
      const msg = err instanceof ApiClientError ? err.message : "Failed to save tenancy";
      setError(msg);
      toast.error(msg);
    },
  });

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{isEdit ? "Edit draft tenancy" : "New tenancy"}</CardTitle>
        <CardDescription>
          {isEdit
            ? "Only draft tenancies can be edited."
            : "Creates a draft; activate it once the contract is signed."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-5">
            <FormField
              control={form.control}
              name="propertyId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Property</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isEdit}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pick a property" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(propertiesQuery.data?.data ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nickname} — {p.addressLine1}, {p.city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!isEdit ? (
              <div className="space-y-3 rounded-lg border p-4">
                <FormField
                  control={form.control}
                  name="tenantMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tenant</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="existing">Pick an existing tenant</SelectItem>
                          <SelectItem value="new">Create a new tenant</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                {tenantMode === "existing" ? (
                  <FormField
                    control={form.control}
                    name="tenantId"
                    render={({ field }) => (
                      <FormItem>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Pick a tenant" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(tenantsQuery.data?.data ?? []).map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.fullName}
                                {t.email ? ` (${t.email})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <FormField
                      control={form.control}
                      name="newTenantName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="newTenantEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="newTenantPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="font-medium">Rolling monthly tenancy</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  New assured tenancies in England cannot have a fixed end date. Record the
                  actual end when the tenancy lawfully finishes.
                </p>
              </div>
              <FormField
                control={form.control}
                name="rentAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monthly rent £</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="950.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rentDueDay"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rent due day</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={28} {...field} />
                    </FormControl>
                    <FormDescription>Day of month, 1–28.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="depositAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deposit £ (optional)</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="1095.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="depositScheme"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deposit scheme</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. DPS (custodial)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="depositReference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deposit reference</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <Label>Lease clauses</Label>
              <p className="text-xs text-muted-foreground">
                Defaults come from Settings; used when the lease contract is
                generated.
              </p>
              <FormField
                control={form.control}
                name="clausePets"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="font-normal">Pets allowed</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="clauseGarden"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="font-normal">Garden maintenance clause</FormLabel>
                  </FormItem>
                )}
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending
                  ? "Saving…"
                  : isEdit
                    ? "Save changes"
                    : "Create draft tenancy"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
