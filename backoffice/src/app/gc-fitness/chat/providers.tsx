"use client";

// providers.tsx
//
// Local QueryClientProvider for the `/gc-fitness/chat` route group. Same
// per-route-group pattern as `/exercises`, `/templates`, and `/habits`:
//   - disjoint TanStack-Query caches prevent stale chat data bleeding into
//     other surfaces.
//   - React-Query devtools mount only when this surface is on screen.
//
// Polling cadence (V1 fallback for live updates — V2 carry-forward to wire a
// client-SDK `onSnapshot` listener via `chat-listener.ts`):
//   - `staleTime: 10s` — inbox treats data older than 10s as stale.
//   - `refetchInterval: 30s` — background poll the inbox / active thread
//     every 30s. Tab visibility gating is handled by React Query out of the
//     box; we additionally enable `refetchOnWindowFocus: true` so switching
//     back to the tab pulls a fresh snapshot immediately.
//
// The per-query hook (`useChatMessages`) overrides `refetchInterval` to
// 10s for the active conversation so an in-flight thread stays tight.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function ChatQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchInterval: 30_000,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
