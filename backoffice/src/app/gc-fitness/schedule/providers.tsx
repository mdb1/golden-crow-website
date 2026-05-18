"use client";

// providers.tsx
//
// Local QueryClientProvider for the /gc-fitness/schedule route group.
// Mirrors the /gc-fitness/exercises provider — each surface owns its own
// QueryClient so the cache + dev-tools are scoped to the route group
// currently on screen.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function ScheduleQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            // The schedule view's listener already sets staleTime: 30s;
            // the global default below is the floor for one-shot
            // `useQuery` calls without their own staleTime.
            staleTime: 30_000,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
