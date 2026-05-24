"use client";

import { RouteErrorBoundary } from "@/components/gc-fitness/route-error-boundary";

export default function TemplatesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorBoundary routeName="templates" error={error} reset={reset} />;
}
