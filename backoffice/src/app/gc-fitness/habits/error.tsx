"use client";

import { RouteErrorBoundary } from "@/components/gc-fitness/route-error-boundary";

export default function HabitsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorBoundary routeName="habits" error={error} reset={reset} />;
}
