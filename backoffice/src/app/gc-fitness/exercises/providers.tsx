"use client";

// providers.tsx
//
// Local QueryClientProvider for the `/gc-fitness/exercises` route group. The
// existing dashboard route group (`(dashboard)/`) ships its own provider; we
// don't want a single global provider because the two surfaces use disjoint
// query caches and TanStack-Query's `defaultOptions.queries.staleTime` may
// differ in the future.
//
// Scoping the provider per route group also keeps the dev-tools mounted only
// when this surface is on screen.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function ExerciseQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Listener pushes via `setQueryData`; we never need to refetch on
            // window focus (the Firestore stream stays subscribed).
            refetchOnWindowFocus: false,
            staleTime: Infinity,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
