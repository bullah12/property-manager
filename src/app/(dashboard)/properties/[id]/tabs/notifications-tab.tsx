"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PropertyDetailDto } from "@/lib/types";

export function NotificationsTab({ property }: { property: PropertyDetailDto }) {
  void property;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>Content arrives in Phase 7.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Empty placeholder.
      </CardContent>
    </Card>
  );
}
