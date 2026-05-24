"use client";

import { RouteErrorBoundary } from "@/components/gc-fitness/route-error-boundary";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorBoundary routeName="settings" error={error} reset={reset} />;
}
