// stale-aware-query-caches.ts
//
// #382 — routes React Query failures into the stale-deployment banner.
//
// The banner hears about a stale tab through window `error` /
// `unhandledrejection` and through `noteIfStaleDeployment` in a call site's
// own catch. Neither sees the Server Actions called from a `useQuery` /
// `useMutation`: React Query catches those errors and keeps them in its cache.
// That covers chat, the habit and nutrition libraries, favorites, the
// calendars — and two POLLING queries (live workouts every 15 s, upcoming
// alerts every 30 s) that keep failing in an old tab with nobody told why.
//
// Spread into every gc-fitness QueryClient:
//   new QueryClient({ ...staleAwareQueryCaches(), defaultOptions: … })
// It only REPORTS — the error still reaches `onError`, `isError` and the
// component's own handling exactly as before.

import { MutationCache, QueryCache } from "@tanstack/react-query";

import { noteIfStaleDeployment } from "./stale-deployment";

export function staleAwareQueryCaches(): {
  queryCache: QueryCache;
  mutationCache: MutationCache;
} {
  return {
    queryCache: new QueryCache({
      onError: (error) => {
        noteIfStaleDeployment(error);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        noteIfStaleDeployment(error);
      },
    }),
  };
}
