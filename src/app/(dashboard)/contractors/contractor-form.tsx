"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiClientError } from "@/lib/api-client";
import { CONTRACTOR_TRADE_LABELS, CONTRACTOR_TRADE_VALUES } from "@/lib/contractors";
import type { ContractorDto } from "@/lib/types";

const optionalEmail = z.union([z.literal(""), z.string().trim().toLowerCase().pipe(z.email("Invalid email"))]);
const optionalWebsite = z.union([
  z.literal(""),
  z
    .string()
    .trim()
    .pipe(z.url("Enter a full URL, including https://"))
    .refine((value) => value.startsWith("https://") || value.startsWith("http://"), {
      message: "Website must use http:// or https://",
    }),
]);
const formSchema = z.object({
  businessName: z.string().trim().min(1, "Required").max(200),
  contactName: z.string().trim().max(200),
  trade: z.enum(CONTRACTOR_TRADE_VALUES),
  email: optionalEmail,
  phone: z.string().trim().max(50),
  website: optionalWebsite,
  serviceArea: z.string().trim().max(300),
  registrationNumber: z.string().trim().max(100),
  notes: z.string().max(10_000),
  status: z.enum(["active", "inactive"]),
});
type FormValues = z.infer<typeof formSchema>;

export function ContractorForm({ contractor }: { contractor?: ContractorDto }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = Boolean(contractor);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      businessName: contractor?.businessName ?? "",
      contactName: contractor?.contactName ?? "",
      trade: contractor?.trade ?? "plumber",
      email: contractor?.email ?? "",
      phone: contractor?.phone ?? "",
      website: contractor?.website ?? "",
      serviceArea: contractor?.serviceArea ?? "",
      registrationNumber: contractor?.registrationNumber ?? "",
      notes: contractor?.notes ?? "",
      status: contractor?.status ?? "active",
    },
  });
  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        ...values,
        contactName: values.contactName || null,
        email: values.email || null,
        phone: values.phone || null,
        website: values.website || null,
        serviceArea: values.serviceArea || null,
        registrationNumber: values.registrationNumber || null,
        notes: values.notes || null,
      };
      return isEdit
        ? (await api.patch<ContractorDto>(`/api/v1/contractors/${contractor!.id}`, payload)).data
        : (await api.post<ContractorDto>("/api/v1/contractors", payload)).data;
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["contractors"] });
      queryClient.invalidateQueries({ queryKey: ["contractor", saved.id] });
      toast.success(isEdit ? "Contractor updated" : "Contractor created");
      router.push(`/contractors/${saved.id}`);
    },
    onError: (error) => toast.error(error instanceof ApiClientError ? error.message : "Failed to save contractor"),
  });

  return (
    <Card className="max-w-3xl">
      <CardHeader><CardTitle>{isEdit ? `Edit ${contractor!.businessName}` : "New contractor"}</CardTitle></CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="businessName" render={({ field }) => <FormItem><FormLabel>Business or trading name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="contactName" render={({ field }) => <FormItem><FormLabel>Contact name (optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="trade" render={({ field }) => <FormItem><FormLabel>Primary trade</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl><SelectContent>{CONTRACTOR_TRADE_VALUES.map((value) => <SelectItem key={value} value={value}>{CONTRACTOR_TRADE_LABELS[value]}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>} />
              <FormField control={form.control} name="serviceArea" render={({ field }) => <FormItem><FormLabel>Service area (optional)</FormLabel><FormControl><Input placeholder="e.g. Birmingham and Solihull" {...field} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="email" render={({ field }) => <FormItem><FormLabel>Email (optional)</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="phone" render={({ field }) => <FormItem><FormLabel>Phone (optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="website" render={({ field }) => <FormItem><FormLabel>Website (optional)</FormLabel><FormControl><Input type="url" placeholder="https://…" {...field} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="registrationNumber" render={({ field }) => <FormItem><FormLabel>Registration number (optional)</FormLabel><FormControl><Input placeholder="e.g. Gas Safe or NICEIC number" {...field} /></FormControl><FormMessage /></FormItem>} />
              {isEdit ? <FormField control={form.control} name="status" render={({ field }) => <FormItem><FormLabel>Status</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select><FormMessage /></FormItem>} /> : null}
            </div>
            <FormField control={form.control} name="notes" render={({ field }) => <FormItem><FormLabel>Notes (optional)</FormLabel><FormControl><Textarea rows={5} {...field} /></FormControl><FormMessage /></FormItem>} />
            <div className="flex gap-2">
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Create contractor"}</Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
