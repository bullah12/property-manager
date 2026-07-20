"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AUTH_CHANGE_STORAGE_KEY } from "@/lib/auth-events";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 0,
            gcTime: 0,
            retry: 1,
            refetchOnMount: "always",
            refetchOnWindowFocus: "always",
          },
        },
      })
  );

  useEffect(() => {
    function discardPrivateCache() {
      void queryClient.cancelQueries();
      queryClient.clear();
    }

    function onStorage(event: StorageEvent) {
      if (event.key !== AUTH_CHANGE_STORAGE_KEY) return;
      discardPrivateCache();
      window.location.reload();
    }

    function onPageShow(event: PageTransitionEvent) {
      if (!event.persisted) return;
      discardPrivateCache();
      window.location.reload();
    }

    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
