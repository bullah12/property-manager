import { Crown, Pencil } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PropertyOwnershipDto } from "@/lib/types";

export function OwnershipTab({
  propertyId,
  ownershipMode,
  ownerships,
}: {
  propertyId: string;
  ownershipMode: "sole" | "shared";
  ownerships: PropertyOwnershipDto[];
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Ownership</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {ownershipMode === "sole" ? "Sole ownership" : `Shared by ${ownerships.length} owners`} · 100% allocated
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/properties/${propertyId}/edit#ownership`}>
            <Pencil className="size-4" /> Edit ownership
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {ownerships.map((owner) => (
          <div key={owner.id} className="flex flex-wrap items-start justify-between gap-4 rounded-lg border p-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{owner.fullName}</p>
                {owner.isMainLandlord ? (
                  <Badge><Crown className="size-3" /> Main landlord</Badge>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{owner.address}</p>
              {(owner.email || owner.phone) ? (
                <p className="text-sm text-muted-foreground">
                  {[owner.email, owner.phone].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </div>
            <p className="text-lg font-semibold">{owner.ownershipPercentage.toFixed(2)}%</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
