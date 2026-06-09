import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import type { Metadata } from "next";

import { BodyThemeScope } from "@/components/gc-fitness/body-theme-scope";
import { ChatNotificationListener } from "@/components/gc-fitness/chat-notification-listener";
import { FirebaseTelemetryInit } from "@/components/gc-fitness/firebase-telemetry-init";
import { GCFitnessShell } from "@/components/gc-fitness/gc-fitness-shell";
import { GCFitnessShellProviders } from "@/components/gc-fitness/shell-providers";
import { TimezoneSync } from "@/components/gc-fitness/timezone-sync";
import { birthdayNotificationCountForTrainer } from "@/lib/gc-fitness/birthday-notifications";
import { civilDateToday } from "@/lib/gc-fitness/civil-date";
import { getTrainerTimezone } from "@/lib/gc-fitness/trainer-timezone";
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
  let trainerEmail: string | null = null;
  let isAdmin = false;
  let birthdayBadgeCount = 0;
  try {
    const user = await getCurrentGCFitnessUser();
    trainerUid = user.uid;
    trainerEmail = user.email;
    isAdmin = user.isAdmin;
    const timezone = await getTrainerTimezone().catch(() => "UTC");
    const todayCivil = civilDateToday(timezone);
    birthdayBadgeCount = await birthdayNotificationCountForTrainer(user.uid, todayCivil);
  } catch {
    trainerUid = null;
    trainerEmail = null;
    isAdmin = false;
    birthdayBadgeCount = 0;
  }

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <FirebaseTelemetryInit />
      <TimezoneSync />
      <BodyThemeScope />
      <div className="gc-fitness-theme">
        <GCFitnessShellProviders>
          <ChatNotificationListener trainerUid={trainerUid} />
          <GCFitnessShell
            trainerUid={trainerUid}
            trainerEmail={trainerEmail}
            isAdmin={isAdmin}
            birthdayNotificationCount={birthdayBadgeCount}
          >
            {children}
          </GCFitnessShell>
        </GCFitnessShellProviders>
      </div>
    </NextIntlClientProvider>
  );
}
