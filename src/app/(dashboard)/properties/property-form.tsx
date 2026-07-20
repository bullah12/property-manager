"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, ApiClientError } from "@/lib/api-client";
import type { PropertyDto } from "@/lib/types";

const ownerFormSchema = z.object({
  ownerId: z.string().optional(),
  fullName: z.string().trim().min(1, "Required").max(300),
  address: z.string().trim().min(1, "Required").max(500),
  phone: z.string().trim().max(50),
  email: z.union([z.literal(""), z.string().trim().pipe(z.email("Invalid email"))]),
  ownershipPercentage: z
    .string()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, "Enter a percentage with up to 2 decimals"),
  isMainLandlord: z.boolean(),
});

const formSchema = z.object({
  nickname: z.string().trim().min(1, "Required").max(200),
  addressLine1: z.string().trim().min(1, "Required").max(300),
  addressLine2: z.string().trim().max(300),
  city: z.string().trim().min(1, "Required").max(120),
  postcode: z.string().trim().min(1, "Required").max(20),
  propertyType: z.enum(["house", "flat", "hmo", "commercial"]),
  bedrooms: z.string().regex(/^\d*$/, "Whole number"),
  purchasePrice: z
    .string()
    .regex(/^(\d+(\.\d{1,2})?)?$/, "Amount in pounds, e.g. 250000 or 250000.00"),
  ownershipMode: z.enum(["sole", "shared"]),
  owners: z.array(ownerFormSchema).min(1),
  notes: z.string().max(10_000),
}).superRefine((value, ctx) => {
  if (value.ownershipMode === "sole" && value.owners.length !== 1) {
    ctx.addIssue({ code: "custom", path: ["owners"], message: "Sole ownership requires one owner" });
  }
  if (value.ownershipMode === "shared" && value.owners.length < 2) {
    ctx.addIssue({ code: "custom", path: ["owners"], message: "Shared ownership requires at least two owners" });
  }
  const total = value.owners.reduce(
    (sum, owner) => sum + Math.round(Number(owner.ownershipPercentage) * 100),
    0
  );
  if (total !== 10_000) {
    ctx.addIssue({ code: "custom", path: ["owners"], message: `Ownership must total 100% (currently ${(total / 100).toFixed(2)}%)` });
  }
  if (value.owners.filter((owner) => owner.isMainLandlord).length !== 1) {
    ctx.addIssue({ code: "custom", path: ["owners"], message: "Select exactly one main landlord" });
  }
});

type FormValues = z.infer<typeof formSchema>;

export function PropertyForm({ property }: { property?: PropertyDto }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = !!property;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nickname: property?.nickname ?? "",
      addressLine1: property?.addressLine1 ?? "",
      addressLine2: property?.addressLine2 ?? "",
      city: property?.city ?? "",
      postcode: property?.postcode ?? "",
      propertyType: property?.propertyType ?? "house",
      bedrooms: property?.bedrooms != null ? String(property.bedrooms) : "",
      purchasePrice:
        property?.purchasePriceCents != null
          ? (property.purchasePriceCents / 100).toFixed(2)
          : "",
      ownershipMode: property?.ownershipMode ?? "sole",
      owners: property?.ownerships.length
        ? property.ownerships.map((owner) => ({
            ownerId: owner.ownerId,
            fullName: owner.fullName,
            address: owner.address,
            phone: owner.phone ?? "",
            email: owner.email ?? "",
            ownershipPercentage: String(owner.ownershipPercentage),
            isMainLandlord: owner.isMainLandlord,
          }))
        : [{
            fullName: "",
            address: "",
            phone: "",
            email: "",
            ownershipPercentage: "100",
            isMainLandlord: true,
          }],
      notes: property?.notes ?? "",
    },
  });
  const { fields: ownerFields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "owners",
  });
  const watchedOwners = form.watch("owners");

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        nickname: values.nickname,
        addressLine1: values.addressLine1,
        addressLine2: values.addressLine2 || null,
        city: values.city,
        postcode: values.postcode,
        propertyType: values.propertyType,
        bedrooms: values.bedrooms === "" ? null : parseInt(values.bedrooms, 10),
        purchasePriceCents:
          values.purchasePrice === ""
            ? null
            : Math.round(parseFloat(values.purchasePrice) * 100),
        ownership: {
          mode: values.ownershipMode,
          owners: values.owners.map((owner) => ({
            ...(owner.ownerId ? { ownerId: owner.ownerId } : {}),
            fullName: owner.fullName,
            address: owner.address,
            phone: owner.phone || null,
            email: owner.email || null,
            ownershipPercentage:
              values.ownershipMode === "sole" ? 100 : Number(owner.ownershipPercentage),
            isMainLandlord: owner.isMainLandlord,
          })),
        },
        notes: values.notes || null,
      };
      if (isEdit) {
        return (await api.patch<PropertyDto>(`/api/v1/properties/${property.id}`, payload)).data;
      }
      return (await api.post<PropertyDto>("/api/v1/properties", payload)).data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      queryClient.invalidateQueries({ queryKey: ["property", data.id] });
      toast.success(isEdit ? "Property updated" : "Property created");
      // Flow 1 (PLAN.md §4): after create, prompt to add UK-default
      // compliance items on the Notifications tab.
      router.push(
        isEdit ? `/properties/${data.id}` : `/properties/${data.id}?tab=notifications&setup=1`
      );
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to save");
    },
  });

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>{isEdit ? `Edit ${property.nickname}` : "New property"}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="nickname"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nickname</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. Maple House" />
                  </FormControl>
                  <FormDescription>How this property appears across the app.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="addressLine1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address line 1</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="addressLine2"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address line 2 (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="postcode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Postcode</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="propertyType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="house">House</SelectItem>
                        <SelectItem value="flat">Flat</SelectItem>
                        <SelectItem value="hmo">HMO</SelectItem>
                        <SelectItem value="commercial">Commercial</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bedrooms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bedrooms (optional)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="purchasePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Purchase price £ (optional)</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="250000.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div id="ownership" className="space-y-4 rounded-lg border p-4">
              <div>
                <h3 className="font-medium">Property ownership</h3>
                <p className="text-sm text-muted-foreground">
                  The main landlord is used by default on agreements and correspondence.
                </p>
              </div>
              <FormField
                control={form.control}
                name="ownershipMode"
                render={({ field }) => (
                  <FormItem>
                    <Tabs
                      value={field.value}
                      onValueChange={(mode) => {
                        const nextMode = mode as "sole" | "shared";
                        field.onChange(nextMode);
                        const current = form.getValues("owners");
                        if (nextMode === "sole") {
                          const selected = current.find((owner) => owner.isMainLandlord) ?? current[0];
                          replace([{ ...selected, ownershipPercentage: "100", isMainLandlord: true }]);
                        } else if (current.length === 1) {
                          replace([
                            { ...current[0], ownershipPercentage: "50", isMainLandlord: true },
                            { fullName: "", address: "", phone: "", email: "", ownershipPercentage: "50", isMainLandlord: false },
                          ]);
                        }
                      }}
                    >
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="sole">Sole ownership</TabsTrigger>
                        <TabsTrigger value="shared">Shared ownership</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-4">
                {ownerFields.map((ownerField, index) => {
                  const isMain = watchedOwners[index]?.isMainLandlord ?? false;
                  return (
                    <div key={ownerField.id} className="space-y-4 rounded-md border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                          <input
                            type="radio"
                            name="main-landlord"
                            checked={isMain}
                            onChange={() => {
                              form.getValues("owners").forEach((_owner, ownerIndex) =>
                                form.setValue(`owners.${ownerIndex}.isMainLandlord`, ownerIndex === index, { shouldValidate: true })
                              );
                            }}
                          />
                          Main landlord
                        </label>
                        {ownerFields.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isMain}
                            title={isMain ? "Select another main landlord before removing this owner" : "Remove owner"}
                            onClick={() => remove(index)}
                          >
                            <Trash2 className="size-4" /> Remove
                          </Button>
                        ) : null}
                      </div>
                      <div
                        className={
                          form.watch("ownershipMode") === "shared"
                            ? "grid gap-4 sm:grid-cols-2"
                            : "grid gap-4"
                        }
                      >
                        <FormField control={form.control} name={`owners.${index}.fullName`} render={({ field }) => (
                          <FormItem><FormLabel>Full legal name</FormLabel><FormControl><Input {...field} placeholder="Individual or company" /></FormControl><FormMessage /></FormItem>
                        )} />
                        {form.watch("ownershipMode") === "shared" ? (
                          <FormField control={form.control} name={`owners.${index}.ownershipPercentage`} render={({ field }) => (
                            <FormItem><FormLabel>Ownership %</FormLabel><FormControl><Input inputMode="decimal" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                        ) : null}
                      </div>
                      <FormField control={form.control} name={`owners.${index}.address`} render={({ field }) => (
                        <FormItem><FormLabel>Address for service of notices</FormLabel><FormControl><Input {...field} placeholder="Postal address in England or Wales" /></FormControl><FormMessage /></FormItem>
                      )} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField control={form.control} name={`owners.${index}.phone`} render={({ field }) => (
                          <FormItem><FormLabel>Phone (optional)</FormLabel><FormControl><Input type="tel" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name={`owners.${index}.email`} render={({ field }) => (
                          <FormItem><FormLabel>Email (optional)</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {form.formState.errors.owners?.root?.message ? (
                <p className="text-sm text-destructive">{form.formState.errors.owners.root.message}</p>
              ) : typeof form.formState.errors.owners?.message === "string" ? (
                <p className="text-sm text-destructive">{form.formState.errors.owners.message}</p>
              ) : null}
              {form.watch("ownershipMode") === "shared" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => append({ fullName: "", address: "", phone: "", email: "", ownershipPercentage: "0", isMainLandlord: false })}
                >
                  <Plus className="size-4" /> Add owner
                </Button>
              ) : null}
            </div>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={4} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Create property"}
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
