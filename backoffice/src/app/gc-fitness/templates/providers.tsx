"use client";

// providers.tsx
//
// Local QueryClientProvider for the `/gc-fitness/templates` route group.
//
// Why per-route-group: the exercises route group ships its own provider
// (`/gc-fitness/exercises/providers.tsx`) for the same reason — we keep
// disjoint TanStack-Query caches so a stale templates listener can't bleed
// into the exercises list (e.g., if both stream off a Firestore document
// with the same id by accident). Local providers also keep React-Query
// devtools mounted only when this surface is on screen.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function TemplatesQueryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Templates: 30s staleTime is plenty (server-action driven, not
            // a live Firestore listener). Set explicitly to avoid inheriting
            // any future global default.
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
