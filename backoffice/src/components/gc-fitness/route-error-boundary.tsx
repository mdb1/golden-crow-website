"use client";

// Plan 20-02 — Shared route-segment error boundary.
//
// Mounted by per-route error.tsx files across /gc-fitness/*. Each route
// passes its own routeName so the console log identifies the source. The
// rendered UI is identical: a recovery Card with bilingual error copy and a
// retry CTA wired to Next.js's reset() callback.

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function RouteErrorBoundary({
  routeName,
  error,
  reset,
}: {
  routeName: string;
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");

  useEffect(() => {
    console.error(`[gc-fitness/${routeName}] route error`, error);
  }, [routeName, error]);

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
