"use client";

import { CircleUser, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMe } from "@/hooks/use-me";
import { api } from "@/lib/api-client";
import { broadcastAuthChange } from "@/lib/auth-events";

export function UserMenu() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();

  async function logout() {
    await queryClient.cancelQueries();
    queryClient.clear();
    try {
      await api.post("/api/v1/auth/logout");
    } finally {
      broadcastAuthChange();
      window.location.replace("/login");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account">
          <CircleUser className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{me?.user.displayName ?? "…"}</div>
          <div className="truncate text-xs text-muted-foreground">
            {me?.user.email ?? ""}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="mr-2 size-4" /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={logout}>
          <LogOut className="mr-2 size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
