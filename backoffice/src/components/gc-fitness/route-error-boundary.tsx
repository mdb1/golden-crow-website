"use client";

// Plan 20-02 — Shared route-segment error boundary.
//
// Mounted by per-route error.tsx files across /gc-fitness/*. Each route
// passes its own routeName so the console log identifies the source. The
// rendered UI is identical: a recovery Card with bilingual error copy and a
// retry CTA wired to Next.js's reset() callback.
//
// Except for a STALE tab (a deploy landed while it was open — rotated Server
// Action IDs or a chunk that no longer exists). "Reintentar" re-renders the
// same old JS and fails again, so for that case the card says a new version
// is out and the tab reloads itself once: the form this boundary replaced is
// already unmounted, and the routine / nutrition editors keep a draft that the
// reload restores.

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  isStaleDeploymentError,
  reloadOntoCurrentDeployment,
} from "@/lib/gc-fitness/stale-deployment";

export function RouteErrorBoundary({
  routeName,
  error,
  reset,
  reload = () => window.location.reload(),
}: {
  routeName: string;
  error: Error & { digest?: string };
  reset: () => void;
  /** Test seam — jsdom cannot stub `window.location.reload`. */
  reload?: () => void;
}) {
  const t = useTranslations("common");
  const tStale = useTranslations("staleDeployment");
  const stale = isStaleDeploymentError(error);

  useEffect(() => {
    console.error(`[gc-fitness/${routeName}] route error`, error);
    if (stale) reloadOntoCurrentDeployment(reload);
    // `reload` is a seam, not an input worth re-running for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeName, error, stale]);

  if (stale) {
    return (
      <div className="gc-page flex flex-col gap-6" data-testid="route-error-stale">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{tStale("title")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{tStale("boundaryBody")}</p>
            <Button onClick={reload} variant="default" className="w-fit rounded-full">
              {tStale("reload")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="gc-page flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("errorGeneric")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error.digest ? (
            <p className="text-xs text-muted-foreground">
              <code className="rounded bg-muted px-1 py-0.5">
                {error.digest}
              </code>
            </p>
          ) : null}
          <Button onClick={reset} variant="default" className="w-fit rounded-full">
            {t("retry")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
