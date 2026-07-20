"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Switch } from "@/components/ui/switch";
import { api, ApiClientError } from "@/lib/api-client";
import type { MeDto } from "@/lib/types";

const formSchema = z.object({
  displayName: z.string().min(1, "Required").max(200),
  timezone: z.string().min(1, "Required").max(64),
  defaultLeadDays: z
    .string()
    .regex(/^\s*\d+(\s*,\s*\d+)*\s*$/, "Comma-separated day counts, e.g. 60, 30, 7"),
  rentOverdueGraceDays: z
    .string()
    .regex(/^\d+$/, "Whole number of days")
    .refine((v) => parseInt(v, 10) <= 60, "Max 60 days"),
  emailEnabled: z.boolean(),
  clausePetsDefault: z.boolean(),
  clauseGardenDefault: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

export function SettingsForm({ me }: { me: MeDto }) {
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      displayName: me.user.displayName,
      timezone: me.user.timezone,
      defaultLeadDays: me.settings.defaultLeadDays.join(", "),
      rentOverdueGraceDays: String(me.settings.rentOverdueGraceDays),
      emailEnabled: me.settings.emailEnabled,
      clausePetsDefault: me.settings.clausePetsDefault,
      clauseGardenDefault: me.settings.clauseGardenDefault,
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const leadDays = values.defaultLeadDays
        .split(",")
        .map((s) => parseInt(s.trim(), 10));
      return (
        await api.patch<MeDto>("/api/v1/settings", {
          displayName: values.displayName,
          timezone: values.timezone,
          defaultLeadDays: leadDays,
          rentOverdueGraceDays: parseInt(values.rentOverdueGraceDays, 10),
          emailEnabled: values.emailEnabled,
          clausePetsDefault: values.clausePetsDefault,
          clauseGardenDefault: values.clauseGardenDefault,
        })
      ).data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["me"], data);
      form.reset({
        displayName: data.user.displayName,
        timezone: data.user.timezone,
        defaultLeadDays: data.settings.defaultLeadDays.join(", "),
        rentOverdueGraceDays: String(data.settings.rentOverdueGraceDays),
        emailEnabled: data.settings.emailEnabled,
        clausePetsDefault: data.settings.clausePetsDefault,
        clauseGardenDefault: data.settings.clauseGardenDefault,
      });
      toast.success("Settings saved");
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to save settings");
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        className="max-w-2xl space-y-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Signed in as {me.user.email} ({me.user.role})
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>
                    Identifies you in the app. Generated agreements use the legal
                    landlord recorded against each property.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Timezone</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Europe/London" />
                  </FormControl>
                  <FormDescription>
                    IANA timezone driving all due-date evaluation.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reminders & rent</CardTitle>
            <CardDescription>
              Defaults for deadline reminders and rent-overdue detection.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="defaultLeadDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default reminder lead days</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="60, 30, 7" />
                  </FormControl>
                  <FormDescription>
                    Days before a deadline when reminders fire.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="rentOverdueGraceDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rent overdue grace (days)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} max={60} {...field} />
                  </FormControl>
                  <FormDescription>
                    Days past the due date before rent counts as overdue.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="emailEnabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel>Email notifications</FormLabel>
                    <FormDescription>
                      Send reminder and overdue emails as well as in-app alerts.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lease clause defaults</CardTitle>
            <CardDescription>
              Pre-selected clause toggles on new tenancies.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="clausePetsDefault"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <FormLabel>Pets allowed by default</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="clauseGardenDefault"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <FormLabel>Garden maintenance clause by default</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save settings"}
        </Button>
      </form>
    </Form>
  );
}
