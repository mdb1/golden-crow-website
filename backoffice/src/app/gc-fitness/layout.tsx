import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

import { GCFitnessShell } from "@/components/gc-fitness/gc-fitness-shell";

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

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <GCFitnessShell>{children}</GCFitnessShell>
    </NextIntlClientProvider>
  );
}
