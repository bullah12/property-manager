"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Mail, MapPin, Pencil, Phone, Plus, Star, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { DateDisplay } from "@/components/date-display";
import { StatusBadge } from "@/components/status-badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiClientError } from "@/lib/api-client";
import { contractorTradeLabel } from "@/lib/contractors";
import type { ContractorDetailDto, ContractorReviewDto } from "@/lib/types";
import { ReviewDialog } from "./review-dialog";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star key={value} className={`size-4 ${value <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
      ))}
    </span>
  );
}

export function ContractorDetail({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<ContractorReviewDto>();
  const [deletingReview, setDeletingReview] = useState<ContractorReviewDto>();
  const { data: contractor, isLoading, isError, refetch } = useQuery({
    queryKey: ["contractor", id],
    queryFn: async () => (await api.get<ContractorDetailDto>(`/api/v1/contractors/${id}`)).data,
  });
  const deleteMutation = useMutation({
    mutationFn: (reviewId: string) => api.delete<{ deleted: true }>(`/api/v1/contractor-reviews/${reviewId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contractor", id] });
      queryClient.invalidateQueries({ queryKey: ["contractors"] });
      toast.success("Review removed");
      setDeletingReview(undefined);
    },
    onError: (error) => toast.error(error instanceof ApiClientError ? error.message : "Failed to remove review"),
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-72 w-full" /></div>;
  if (isError || !contractor) return <div className="text-sm text-muted-foreground">Failed to load contractor. <button className="underline" onClick={() => refetch()}>Retry</button></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{contractor.businessName}</h2>
            <Badge variant="secondary">{contractorTradeLabel(contractor.trade)}</Badge>
            <StatusBadge status={contractor.status} />
          </div>
          {contractor.contactName ? <p className="mt-1 text-sm text-muted-foreground">{contractor.contactName}</p> : null}
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
            {contractor.phone ? <a href={`tel:${contractor.phone}`} className="inline-flex items-center gap-1 hover:underline"><Phone className="size-3.5" /> {contractor.phone}</a> : null}
            {contractor.email ? <a href={`mailto:${contractor.email}`} className="inline-flex items-center gap-1 hover:underline"><Mail className="size-3.5" /> {contractor.email}</a> : null}
            {contractor.website ? <a href={contractor.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline"><ExternalLink className="size-3.5" /> Website</a> : null}
          </div>
        </div>
        <Button variant="outline" asChild><Link href={`/contractors/${id}/edit`}><Pencil className="size-4" /> Edit</Link></Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Contact details</CardTitle></CardHeader>
        <CardContent className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><div className="text-muted-foreground">Service area</div><div className="mt-1 flex items-center gap-1"><MapPin className="size-3.5" /> {contractor.serviceArea || "Not recorded"}</div></div>
          <div><div className="text-muted-foreground">Registration number</div><div className="mt-1">{contractor.registrationNumber || "Not recorded"}</div></div>
          <div><div className="text-muted-foreground">Primary trade</div><div className="mt-1">{contractorTradeLabel(contractor.trade)}</div></div>
          {contractor.notes ? <div className="sm:col-span-2 lg:col-span-3"><div className="text-muted-foreground">Notes</div><div className="mt-1 whitespace-pre-wrap">{contractor.notes}</div></div> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Reviews</CardTitle>
            <CardDescription className="mt-1">{contractor.reviewCount === 0 ? "No reviews yet." : <span className="inline-flex items-center gap-2"><Stars rating={contractor.averageRating ?? 0} /> {contractor.averageRating?.toFixed(1)} from {contractor.reviewCount} {contractor.reviewCount === 1 ? "review" : "reviews"}</span>}</CardDescription>
          </div>
          <Button size="sm" onClick={() => { setEditingReview(undefined); setDialogOpen(true); }}><Plus className="size-4" /> Add review</Button>
        </CardHeader>
        <CardContent>
          {contractor.reviews.length === 0 ? <p className="text-sm text-muted-foreground">Add a review after a job to build a useful record of reliable tradespeople.</p> : (
            <div className="divide-y">
              {contractor.reviews.map((review) => (
                <div key={review.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><Stars rating={review.rating} /><DateDisplay iso={review.reviewedOn} className="text-sm text-muted-foreground" /></div>
                      <p className="mt-2 font-medium">{review.workDescription}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" aria-label="Edit review" onClick={() => { setEditingReview(review); setDialogOpen(true); }}><Pencil className="size-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label="Delete review" onClick={() => setDeletingReview(review)}><Trash2 className="size-4 text-destructive" /></Button>
                    </div>
                  </div>
                  {review.comments ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{review.comments}</p> : null}
                  <div className={`mt-2 inline-flex items-center gap-1 text-xs ${review.wouldHireAgain ? "text-emerald-700" : "text-muted-foreground"}`}>{review.wouldHireAgain ? <Check className="size-3.5" /> : <X className="size-3.5" />}{review.wouldHireAgain ? "Would hire again" : "Would not hire again"}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ReviewDialog contractorId={id} review={editingReview} open={dialogOpen} onOpenChange={setDialogOpen} />
      <AlertDialog open={Boolean(deletingReview)} onOpenChange={(open) => { if (!open) setDeletingReview(undefined); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Remove this review?</AlertDialogTitle><AlertDialogDescription>This will permanently remove the rating and comments for “{deletingReview?.workDescription}”.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={deleteMutation.isPending} onClick={() => deletingReview && deleteMutation.mutate(deletingReview.id)}>Remove review</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
