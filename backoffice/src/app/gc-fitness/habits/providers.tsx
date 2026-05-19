"use client";

// providers.tsx
//
// Local QueryClientProvider for the `/gc-fitness/habits` route group. Same
// per-route-group pattern as `/exercises` and `/templates`:
//   - disjoint TanStack-Query caches prevent stale habit data bleeding into
//     other surfaces.
//   - React-Query devtools mount only when this surface is on screen.
//
// staleTime: 30s. The habit list is Server-Action-backed (not a live
// Firestore listener) so we don't refetch on window focus, but we do want
// the next mount to refresh after the user navigates away briefly.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function HabitsQueryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 30_000,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
