"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/use-me";
import { SettingsForm } from "./settings-form";

export function SettingsScreen() {
  const { data: me, isLoading, isError, refetch } = useMe();

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isError || !me) {
    return (
      <div className="text-sm text-muted-foreground">
        Failed to load settings.{" "}
        <button className="underline" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }
  return <SettingsForm me={me} />;
}
