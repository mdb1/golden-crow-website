"use client";

import { RouteErrorBoundary } from "@/components/gc-fitness/route-error-boundary";

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorBoundary routeName="chat" error={error} reset={reset} />;
}
