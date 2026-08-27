"use client";

import { Building2, UserRound } from "lucide-react";
import { appText, type AppLanguage } from "@/lib/language";
import {
  CRM_TARGET_OPTIONS,
  type PartnershipCrmTargetKind,
} from "@/lib/partnership-crm";
import { cn } from "@/lib/utils";

export function CrmTargetSegmentedControl({
  value,
  onChange,
  language,
  disabled = false,
  className,
}: {
  value: PartnershipCrmTargetKind;
  onChange: (value: PartnershipCrmTargetKind) => void;
  language: AppLanguage;
  disabled?: boolean;
  className?: string;
}) {
  const t = (text: string) => appText(language, text);

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-1 rounded-xl border border-border/80 bg-muted/45 p-1",
        className,
      )}
      role="tablist"
      aria-label={t("CRM target")}
    >
      {CRM_TARGET_OPTIONS.map((option) => {
        const selected = option.value === value;
        const Icon = option.value === "organizations" ? Building2 : UserRound;

        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-12 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              selected
                ? "bg-blue-600 text-white shadow-[0_12px_24px_rgba(37,99,235,0.22)] hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
                : "text-muted-foreground hover:bg-background/85 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{t(option.label)}</span>
          </button>
        );
      })}
    </div>
  );
}
