"use client";

import { Languages } from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { Button } from "@/components/ui/button";
import type { AppLanguage } from "@/lib/language";

const OPTIONS: Array<{ value: AppLanguage; label: string }> = [
  { value: "en", label: "EN" },
  { value: "es", label: "ES" },
];

export function LanguageToggle() {
  const { language, setLanguage } = useAppLanguage();
  const nextLanguage = language === "en" ? "Spanish" : "English";

  return (
    <div
      className="inline-flex items-center gap-1 rounded-md border border-border bg-background/72 p-1"
      role="group"
      aria-label="Language"
      title={`Switch to ${nextLanguage}`}
    >
      <Languages className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
      {OPTIONS.map((option) => {
        const active = option.value === language;

        return (
          <Button
            key={option.value}
            type="button"
            variant={active ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs font-semibold"
            aria-pressed={active}
            onClick={() => setLanguage(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
