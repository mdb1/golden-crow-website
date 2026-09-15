"use client";

// stale-deployment-banner.tsx
//
// #382 — the bar a coach sees when their tab has fallen behind a deploy.
//
// A redeploy rotates every Server Action ID, so a tab opened before it can no
// longer save anything: Next.js throws `Server Action "…" was not found on the
// server`. That error reached a coach verbatim, under a form they had already
// filled in, with no hint that the page was simply old.
//
// WHAT THIS DELIBERATELY DOES NOT DO: reload. Losing the filled-in form is the
// injury being reported; an automatic refresh would cause it faster and more
// reliably. The bar explains the state, says to copy anything unsaved, and
// leaves the reload on a button the coach presses when they are ready.
//
// Mounted once in `app/gc-fitness/layout.tsx`, next to the other layout-level
// listeners. It covers two paths into the same state:
//   1. window `error` / `unhandledrejection` — the uncaught case, which is how
//      the coach originally saw the raw message;
//   2. `noteIfStaleDeployment(err)` called from a call site's own `catch`,
//      for the handlers that swallow the error into a toast.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  hasReportedStaleDeployment,
  isStaleDeploymentError,
  reportStaleDeployment,
  subscribeStaleDeployment,
} from "@/lib/gc-fitness/stale-deployment";

interface StaleDeploymentBannerProps {
  /**
   * Test seam. jsdom 26 makes `window.location` non-configurable, so a test
   * cannot stub `reload` — and the assertion that matters here is precisely
   * "nothing reloads until the coach presses the button", which is the
   * difference between keeping and losing their filled-in form.
   */
  onReload?: () => void;
}

export function StaleDeploymentBanner({
  onReload,
}: StaleDeploymentBannerProps = {}) {
  const t = useTranslations("staleDeployment");
  const [stale, setStale] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // An error may have landed before this mounted (a Server Action failing
    // during hydration, say) — the module latches the first report so the
    // banner is not lost to a race.
    if (hasReportedStaleDeployment()) setStale(true);

    const unsubscribe = subscribeStaleDeployment(() => setStale(true));

    const onRejection = (event: PromiseRejectionEvent) => {
      if (isStaleDeploymentError(event.reason)) reportStaleDeployment();
    };
    const onError = (event: ErrorEvent) => {
      if (isStaleDeploymentError(event.error)) reportStaleDeployment();
    };
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);

    return () => {
      unsubscribe();
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  if (!stale || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="stale-deployment-banner"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-3 sm:p-4"
    >
      <div className="flex w-full max-w-2xl flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/15 p-3 text-foreground shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between dark:border-amber-400/40 dark:bg-amber-400/15">
        <div className="min-w-0">
          <p className="text-sm font-medium">{t("title")}</p>
          <p className="text-xs text-muted-foreground">{t("body")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDismissed(true)}
          >
            {t("dismiss")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => (onReload ?? (() => window.location.reload()))()}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            {t("reload")}
          </Button>
        </div>
      </div>
    </div>
  );
}
