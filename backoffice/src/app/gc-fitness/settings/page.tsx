// /gc-fitness/settings/page.tsx — Trainer Settings shell (Server Component).
//
// Closes CHAT-11 (the trainer-side surface for chatQuickReplies templates).
//
// 2026-06 restyle: the page now opens with a coach profile card (square gold
// initials avatar + derived name + email) and then groups the real, functional
// settings controls into rounded list-rows with colored icon chips — matching
// the reference design. NO behavior changed: the Idioma, Tema, and Respuestas
// rápidas rows host the exact same controls (LanguageForm /
// GCFitnessAppearanceToggle / QuickRepliesForm) that shipped before, just
// reorganized into the grouped look. See `settings-sections.tsx`.
//
// Auth gate mirrors `/gc-fitness/chat/page.tsx` (P08-11) + the rest of the
// gc-fitness route tree:
//   - missing/invalid cookie     → redirect to `/gc-fitness/login`
//   - role != trainer / removed  → redirect to login (same "Forbidden" surface)
//   - misconfigured env          → throws, surfaces Next.js 500
//
// PRE-FETCH (T-08-12-01 mitigation, denorm note from PLAN.md):
//   The trainer profile (chatQuickReplies + displayName) is resolved
//   server-side via `getCurrentTrainerProfile()` and threaded to the client
//   form as a prop. This avoids:
//     a) a client-side round-trip flash showing an empty form for one tick
//        before React Query hydrates,
//     b) exposing the full /users/{uid} payload to the client bundle.
//
// `dynamic = "force-dynamic"` — Settings is per-trainer, never cacheable.

import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { getCurrentTrainerProfile } from "@/lib/gc-fitness/user-actions";
import { PageHeader } from "@/components/gc-fitness/page-header";
import { Badge } from "@/components/ui/badge";

import { SettingsSections } from "./settings-sections";

export const dynamic = "force-dynamic";

/** Derive a friendly coach name from the email local-part (no extra read). */
function deriveName(email: string): string {
  const local = email.split("@")[0] ?? "coach";
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "Coach"
  );
}

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "·"
  );
}

export default async function SettingsPage() {
  let trainer: { uid: string; email: string };
  try {
    trainer = await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }

  const profile = await getCurrentTrainerProfile();
  const t = await getTranslations("settings");
  const tLang = await getTranslations("settings.language");
  const currentLocale = (await getLocale()) as "en" | "es";

  const name =
    profile.displayName.trim().length > 0
      ? profile.displayName.trim()
      : deriveName(trainer.email);
  const localeLabel =
    currentLocale === "es" ? tLang("spanish") : tLang("english");

  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {/* Coach profile card — square gold initials avatar + identity. */}
      <div className="flex flex-col gap-4 rounded-[1.25rem] border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:gap-5">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="truncate font-heading text-xl font-semibold text-foreground">
            {name}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {trainer.email}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {/* TODO i18n: verified coach badge */}
            <Badge variant="success">Verificado</Badge>
          </div>
        </div>
      </div>

      <SettingsSections
        currentLocale={currentLocale}
        localeLabel={localeLabel}
        initialReplies={profile.chatQuickReplies}
      />
    </div>
  );
}
