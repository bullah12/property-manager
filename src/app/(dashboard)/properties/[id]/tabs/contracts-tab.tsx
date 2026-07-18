"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PropertyDetailDto } from "@/lib/types";

export function ContractsTab({ property }: { property: PropertyDetailDto }) {
  void property;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contracts</CardTitle>
        <CardDescription>Content arrives in Phase 4.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Empty placeholder.
      </CardContent>
    </Card>
  );
}
