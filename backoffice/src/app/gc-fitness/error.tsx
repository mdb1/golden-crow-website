"use client";

// The catch-all boundary for /gc-fitness. Each big section has its own
// error.tsx, but a page without one (clients list, library, nutrition-adjacent
// screens, admin…) used to fall straight through to Next's built-in
// "This page couldn't load" — which is what a coach saw, browser-translated,
// after pressing "Guardar cambios". This keeps the failure inside the portal
// shell (sidebar, banner, i18n) and gives a stale tab its reload.

import { RouteErrorBoundary } from "@/components/gc-fitness/route-error-boundary";

export default function GCFitnessError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorBoundary routeName="root" error={error} reset={reset} />;
}
