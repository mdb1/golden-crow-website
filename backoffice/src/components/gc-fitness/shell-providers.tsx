"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

// Shell-scoped QueryClient for the GC Fitness trainer surface (BADGE-04).
//
// The GC Fitness layout wraps every /gc-fitness/* route in this provider so
// the sidebar's chat badge (useTrainerChats) has a QueryClient on every
// surface, not just routes that already mount their own per-group provider
// (chat/clients/schedule/habits/exercises/templates).
//
// Per-group providers continue to own their own caches — nesting is fine;
// the shell-level cache holds shell-only data (chat unread totals) while
// each route owns its surface-specific cache.
export function GCFitnessShellProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
