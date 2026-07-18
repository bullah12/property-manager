"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PropertyDetailDto } from "@/lib/types";

export function ExpensesTab({ property }: { property: PropertyDetailDto }) {
  void property;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Expenses</CardTitle>
        <CardDescription>Content arrives in Phase 5.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Empty placeholder.
      </CardContent>
    </Card>
  );
}
