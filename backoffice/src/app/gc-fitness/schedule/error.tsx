"use client";

import { RouteErrorBoundary } from "@/components/gc-fitness/route-error-boundary";

export default function ScheduleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorBoundary routeName="schedule" error={error} reset={reset} />;
}
