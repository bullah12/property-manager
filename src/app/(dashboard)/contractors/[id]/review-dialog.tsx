"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiClientError } from "@/lib/api-client";
import type { ContractorReviewDto } from "@/lib/types";

const schema = z.object({
  rating: z.number().int().min(1).max(5),
  reviewedOn: z.string().min(1, "Required"),
  workDescription: z.string().trim().min(1, "Required").max(500),
  comments: z.string().max(5_000),
  wouldHireAgain: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

function today() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function ReviewDialog({
  contractorId,
  review,
  open,
  onOpenChange,
}: {
  contractorId: string;
  review?: ContractorReviewDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { rating: 5, reviewedOn: today(), workDescription: "", comments: "", wouldHireAgain: true },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        rating: review?.rating ?? 5,
        reviewedOn: review?.reviewedOn ?? today(),
        workDescription: review?.workDescription ?? "",
        comments: review?.comments ?? "",
        wouldHireAgain: review?.wouldHireAgain ?? true,
      });
    }
  }, [form, open, review]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = { ...values, comments: values.comments || null };
      return review
        ? (await api.patch<ContractorReviewDto>(`/api/v1/contractor-reviews/${review.id}`, payload)).data
        : (await api.post<ContractorReviewDto>(`/api/v1/contractors/${contractorId}/reviews`, payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contractor", contractorId] });
      queryClient.invalidateQueries({ queryKey: ["contractors"] });
      toast.success(review ? "Review updated" : "Review added");
      onOpenChange(false);
    },
    onError: (error) => toast.error(error instanceof ApiClientError ? error.message : "Failed to save review"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{review ? "Edit review" : "Add review"}</DialogTitle>
          <DialogDescription>Record your experience after this contractor completed work.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="rating" render={({ field }) => <FormItem><FormLabel>Rating</FormLabel><Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))}><FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl><SelectContent>{[5, 4, 3, 2, 1].map((rating) => <SelectItem key={rating} value={String(rating)}>{rating} {rating === 1 ? "star" : "stars"}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>} />
              <FormField control={form.control} name="reviewedOn" render={({ field }) => <FormItem><FormLabel>Date of work</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>} />
            </div>
            <FormField control={form.control} name="workDescription" render={({ field }) => <FormItem><FormLabel>Work completed</FormLabel><FormControl><Input placeholder="e.g. Repaired leaking kitchen tap" {...field} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="comments" render={({ field }) => <FormItem><FormLabel>Comments (optional)</FormLabel><FormControl><Textarea rows={4} {...field} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="wouldHireAgain" render={({ field }) => <FormItem className="flex items-center gap-2"><FormControl><Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} /></FormControl><FormLabel className="font-normal">I would hire this contractor again</FormLabel><FormMessage /></FormItem>} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save review"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
