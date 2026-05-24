"use client";

import { RouteErrorBoundary } from "@/components/gc-fitness/route-error-boundary";

export default function ExercisesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorBoundary routeName="exercises" error={error} reset={reset} />;
}
