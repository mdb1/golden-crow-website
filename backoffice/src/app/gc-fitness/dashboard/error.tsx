"use client";

import { RouteErrorBoundary } from "@/components/gc-fitness/route-error-boundary";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorBoundary routeName="dashboard" error={error} reset={reset} />;
}
