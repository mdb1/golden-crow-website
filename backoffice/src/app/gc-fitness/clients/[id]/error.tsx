"use client";

// /gc-fitness/clients/[id]/error.tsx — Plan 20-06 route-segment error boundary.
//
// Catches throws from the page-shell async data fetches (listClientGoals,
// getClientNotes, listProgressPhotosForClient, getClientDailyTimelineDay) so
// the trainer sees a recovery card with a retry CTA instead of a blank page.
// Per-widget Suspense boundaries inside the page already handle widget-scoped
// failures; this catches the page-level ones.

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ClientDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");

  useEffect(() => {
    console.error("[gc-fitness/clients/[id]] route error", error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <Card>
        <CardHeader>
          <CardTitle>{t("errorGeneric")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error.digest ? (
            <p className="text-xs text-muted-foreground">
              <code className="rounded bg-muted px-1 py-0.5">
                {error.digest}
              </code>
            </p>
          ) : null}
          <Button onClick={reset} variant="default" className="w-fit">
            {t("retry")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
