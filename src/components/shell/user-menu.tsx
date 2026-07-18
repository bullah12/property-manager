"use client";

import { CircleUser } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Placeholder user menu; real session + logout arrive in Phase 1. */
export function UserMenu() {
  return (
    <Button variant="ghost" size="icon" aria-label="Account">
      <CircleUser className="size-5" />
    </Button>
  );
}
