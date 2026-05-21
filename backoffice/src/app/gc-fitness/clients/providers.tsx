"use client";

// providers.tsx — React Query provider for the `/gc-fitness/clients` surface.
//
// Mirrors `/gc-fitness/chat/providers.tsx` (per-route-group client cache
// pattern) but with looser defaults: the roster doesn't background-poll
// today — it is a Server-Component render. The provider is included anyway
// so 11-06's filter-chip + future client-side mutations (Send nudge, etc.)
// can use React Query hooks without re-wiring the layout.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function RosterQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
