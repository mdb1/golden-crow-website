"use client";

// providers.tsx
//
// Local QueryClientProvider for the Biblioteca's Nutrición tab (#918). Same
// per-route-group pattern as `/exercises`, `/templates` and `/habits`: a disjoint TanStack
// cache so a stale meal list cannot bleed into another surface, and devtools that mount
// only while this tab is on screen.
//
// staleTime 30s: the lists are Server-Action-backed (not live Firestore listeners), so
// there is no reason to refetch on focus, but a re-mount after a short detour should show
// what the coach just saved from another tab.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function NutritionLibraryQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { refetchOnWindowFocus: false, staleTime: 30_000 },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
