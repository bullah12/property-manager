"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
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
import { api, ApiClientError } from "@/lib/api-client";
import type { PropertyDto } from "@/lib/types";

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
  notes: z.string().max(10_000),
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
      notes: property?.notes ?? "",
    },
  });

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
      router.push(`/properties/${data.id}`);
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to save");
    },
  });

  return (
    <Card className="max-w-2xl">
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
