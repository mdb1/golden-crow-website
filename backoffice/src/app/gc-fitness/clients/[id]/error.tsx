"use client";

// Migrated to the shared RouteErrorBoundary in Plan 20-02 so every
// /gc-fitness/* route surfaces an identical recovery card.

import { RouteErrorBoundary } from "@/components/gc-fitness/route-error-boundary";

export default function ClientDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorBoundary routeName="clients/[id]" error={error} reset={reset} />
  );
}
