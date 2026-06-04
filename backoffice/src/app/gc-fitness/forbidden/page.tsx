import { getTranslations } from "next-intl/server";
import { ShieldAlert } from "lucide-react";

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
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-[1.5rem] border bg-card p-7 text-center shadow-sm sm:p-9">
        <span className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-[color:var(--badge-rose-border)] bg-[color:var(--badge-rose-bg)] text-[color:var(--badge-rose-fg)] [&>svg]:size-8">
          <ShieldAlert />
        </span>

        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("eyebrow")}
        </p>
        <h1 className="mt-1 font-heading text-2xl font-semibold text-foreground">
          {t("title")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t("body")}
        </p>

        <div className="mt-7">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
