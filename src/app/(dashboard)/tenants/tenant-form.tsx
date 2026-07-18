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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiClientError } from "@/lib/api-client";
import type { TenantDto } from "@/lib/types";

const formSchema = z.object({
  fullName: z.string().trim().min(1, "Required").max(200),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().pipe(z.email("Invalid email"))]),
  phone: z.string().trim().max(50),
  notes: z.string().max(10_000),
});

type FormValues = z.infer<typeof formSchema>;

export function TenantForm({ tenant }: { tenant?: TenantDto }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = !!tenant;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: tenant?.fullName ?? "",
      email: tenant?.email ?? "",
      phone: tenant?.phone ?? "",
      notes: tenant?.notes ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        fullName: values.fullName,
        email: values.email || null,
        phone: values.phone || null,
        notes: values.notes || null,
      };
      if (isEdit) {
        return (await api.patch<TenantDto>(`/api/v1/tenants/${tenant.id}`, payload)).data;
      }
      return (await api.post<TenantDto>("/api/v1/tenants", payload)).data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      queryClient.invalidateQueries({ queryKey: ["tenant", data.id] });
      toast.success(isEdit ? "Tenant updated" : "Tenant created");
      router.push(`/tenants/${data.id}`);
    },
    onError: (err) =>
      toast.error(err instanceof ApiClientError ? err.message : "Failed to save"),
  });

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>{isEdit ? `Edit ${tenant.fullName}` : "New tenant"}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (optional)</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
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
                {mutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Create tenant"}
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
