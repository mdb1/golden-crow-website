import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import type { Metadata } from "next";

import { BodyThemeScope } from "@/components/gc-fitness/body-theme-scope";
import { FirebaseTelemetryInit } from "@/components/gc-fitness/firebase-telemetry-init";
import { GCFitnessShell } from "@/components/gc-fitness/gc-fitness-shell";
import { GCFitnessShellProviders } from "@/components/gc-fitness/shell-providers";
import { getCurrentGCFitnessUser } from "@/lib/gc-fitness/auth-helpers";

export const metadata: Metadata = {
  title: "GC Fitness Admin",
  description: "GC Fitness trainer backoffice.",
};

// Plan 13-03 (Phase 13 i18n).
//
// Wraps the gc-fitness subtree in <NextIntlClientProvider> so both Server
// Components (via getTranslations) and Client Components (via useTranslations)
// can resolve translations. Provider scope is intentionally limited to this
// route group so other backoffice surfaces (MyDNAMap, Pocket Gyms) are
// unaffected.
export default async function GCFitnessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();
  let trainerUid: string | null = null;
  let isAdmin = false;
  try {
    const user = await getCurrentGCFitnessUser();
    trainerUid = user.uid;
    isAdmin = user.isAdmin;
  } catch {
    trainerUid = null;
    isAdmin = false;
  }

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <FirebaseTelemetryInit />
      <BodyThemeScope />
      <div className="gc-fitness-theme">
        <GCFitnessShellProviders>
          <GCFitnessShell trainerUid={trainerUid} isAdmin={isAdmin}>
            {children}
          </GCFitnessShell>
        </GCFitnessShellProviders>
      </div>
    </NextIntlClientProvider>
  );
}
