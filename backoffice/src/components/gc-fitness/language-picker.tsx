"use client";

// Language picker for the GC Fitness trainer surface (Plan 13-03).
//
// Sits in the top bar of the gc-fitness shell. Three options:
//   - Auto (system) — deletes the NEXT_LOCALE cookie so request.ts falls back
//     to the Accept-Language sniff on next render.
//   - English — sets NEXT_LOCALE=en
//   - Spanish — sets NEXT_LOCALE=es
//
// Selection POSTs to /api/gc-fitness/locale (which mutates the cookie via the
// Server-side cookies() API) and then router.refresh() causes the gc-fitness
// layout RSC to re-resolve the locale and re-hydrate NextIntlClientProvider
// with the new messages.

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type LocaleChoice = "auto" | "en" | "es";

export function LanguagePicker() {
  const router = useRouter();
  const t = useTranslations("shell.languagePicker");

  async function setLocale(choice: LocaleChoice) {
    try {
      await fetch("/api/gc-fitness/locale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale: choice }),
      });
    } catch {
      // best-effort — refresh will re-attempt resolution on the server anyway
    }
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("ariaLabel")}
        >
          <Languages className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setLocale("auto")}>
          {t("auto")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setLocale("en")}>
          {t("english")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setLocale("es")}>
          {t("spanish")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
