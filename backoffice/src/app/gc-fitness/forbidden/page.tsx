import { getTranslations } from "next-intl/server";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { HelperBanner } from "@/components/helper-banner";
import { SignOutButton } from "@/components/gc-fitness/sign-out-button";

// Allowlist denial page for the gc-fitness trainer surface.
//
// Reachable when (a) the route handler /api/gc-fitness/login rejected an
// authenticated user whose email is not in GC_FITNESS_TEAM_ALLOWLIST (403 →
// client-side redirect), OR (b) proxy.ts handleValidToken detected an
// allowlist miss on a path under /gc-fitness/* (server-side redirect).
//
// Public route (no auth check) — the proxy matcher entry for /gc-fitness/*
// short-circuits to NextResponse.next() for this path so the user can see the
// reason they were denied + sign out cleanly.
//
// Plan 13-03 — i18n via getTranslations('forbidden').
export default async function GCFitnessForbiddenPage() {
  const t = await getTranslations("forbidden");
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="section-eyebrow">{t("eyebrow")}</p>
          <CardTitle className="font-heading text-3xl font-semibold">
            {t("title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <HelperBanner title={t("bannerTitle")} tone="red">
            {t("body")}
          </HelperBanner>
          <SignOutButton />
        </CardContent>
      </Card>
    </div>
  );
}
