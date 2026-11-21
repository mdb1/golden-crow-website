"use client";

import { useAppLanguage } from "@/components/app-language-provider";
import { PageHero } from "@/components/page-hero";
import { appText } from "@/lib/language";

export function PublisherSupportBookingHero({ isNew = false }: { isNew?: boolean }) {
  const { language } = useAppLanguage();

  return (
    <PageHero
      eyebrow={appText(language, "Publisher portal")}
      title={appText(language, isNew ? "New support booking" : "Support bookings")}
      description={appText(
        language,
        isNew
          ? "Choose an available time and a reason to help us prepare for your meeting."
          : "View your meetings with the Pocket Genes team and book a time to get help.",
      )}
    />
  );
}
