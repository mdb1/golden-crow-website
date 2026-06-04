"use client";

// settings-sections.tsx
//
// Redesigned grouped settings rows for /gc-fitness/settings (2026-06 restyle).
//
// Pure presentation + light client interactivity — NO behavior change to the
// underlying controls. The real functional controls are reused as-is:
//   - Idioma   → <LanguageForm> (the `updatePreferredLocale` Server Action)
//   - Tema     → <GCFitnessAppearanceToggle> (localStorage + data-theme)
//   - Respuestas rápidas → <QuickRepliesForm> (the `updateChatQuickReplies`
//                          Server Action + useFieldArray editor)
//
// Each "row" with an editor is an expandable disclosure (button → chevron
// rotates, panel reveals the existing form). Rows are grouped under labelled
// sections (CUENTA / SUSCRIPCIÓN / PREFERENCIAS) matching the reference design.

import { useState, type ReactNode } from "react";
import {
  ChevronRight,
  Languages,
  MessageSquareText,
  SunMoon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { GCFitnessAppearanceToggle } from "@/components/gc-fitness/gc-fitness-appearance-toggle";

import { LanguageForm } from "./language-form";
import { QuickRepliesForm } from "./quick-replies-form";

type ChipTone = "brand" | "violet" | "success" | "warning";

const CHIP_TONE: Record<ChipTone, string> = {
  brand:
    "border-[color:var(--badge-brand-border)] bg-[color:var(--badge-brand-bg)] text-[color:var(--badge-brand-fg)]",
  violet:
    "border-[color:var(--badge-violet-border)] bg-[color:var(--badge-violet-bg)] text-[color:var(--badge-violet-fg)]",
  success:
    "border-[color:var(--badge-success-border)] bg-[color:var(--badge-success-bg)] text-[color:var(--badge-success-fg)]",
  warning:
    "border-[color:var(--badge-warning-border)] bg-[color:var(--badge-warning-bg)] text-[color:var(--badge-warning-fg)]",
};

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function Section({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[1.25rem] border bg-card shadow-sm">
      {children}
    </div>
  );
}

function IconChip({ tone, icon }: { tone: ChipTone; icon: ReactNode }) {
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl border [&>svg]:size-5",
        CHIP_TONE[tone],
      )}
    >
      {icon}
    </span>
  );
}

/** A static informational row: chip + title + value, no editor. */
function InfoRow({
  tone,
  icon,
  title,
  value,
  trailing,
  last,
}: {
  tone: ChipTone;
  icon: ReactNode;
  title: ReactNode;
  value?: ReactNode;
  trailing?: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3.5",
        !last && "border-b border-border",
      )}
    >
      <IconChip tone={tone} icon={icon} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        {value ? (
          <p className="truncate text-sm text-muted-foreground">{value}</p>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

/** An expandable row: tapping the header reveals the editor panel below. */
function ExpandableRow({
  tone,
  icon,
  title,
  value,
  children,
  last,
}: {
  tone: ChipTone;
  icon: ReactNode;
  title: ReactNode;
  value?: ReactNode;
  children: ReactNode;
  last?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn(!last && "border-b border-border")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50"
      >
        <IconChip tone={tone} icon={icon} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {title}
          </p>
          {value ? (
            <p className="truncate text-sm text-muted-foreground">{value}</p>
          ) : null}
        </div>
        <ChevronRight
          className={cn(
            "size-5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
      </button>
      {open ? (
        <div className="border-t border-border bg-muted/20 px-4 py-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export interface SettingsSectionsProps {
  currentLocale: "en" | "es";
  localeLabel: string;
  initialReplies: string[];
}

export function SettingsSections({
  currentLocale,
  localeLabel,
  initialReplies,
}: SettingsSectionsProps) {
  const tSettings = useTranslations("settings");
  const tQuick = useTranslations("settings.quickReplies");
  const tLang = useTranslations("settings.language");
  const tPrefs = useTranslations("settings.preferences");
  const tTheme = useTranslations("settings.theme");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <SectionLabel>{tSettings("preferencesGroup")}</SectionLabel>
        <Section>
          <ExpandableRow
            tone="warning"
            icon={<Languages />}
            title={tLang("title")}
            value={localeLabel}
          >
            <LanguageForm currentLocale={currentLocale} />
          </ExpandableRow>
          <InfoRow
            tone="brand"
            icon={<SunMoon />}
            title={tTheme("title")}
            value={tTheme("helper")}
            trailing={<GCFitnessAppearanceToggle />}
            last
          />
        </Section>
      </div>

      <div className="flex flex-col gap-2">
        {/* Reuse tPrefs as the umbrella group; quick replies live under chat tools. */}
        <SectionLabel>{tSettings("chatGroup")}</SectionLabel>
        <Section>
          <ExpandableRow
            tone="violet"
            icon={<MessageSquareText />}
            title={tQuick("title")}
            value={tQuick("savedCount", { count: initialReplies.length })}
            last
          >
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {tQuick("description")}
              </p>
              <QuickRepliesForm initialReplies={initialReplies} />
            </div>
          </ExpandableRow>
        </Section>
      </div>

      <p className="sr-only">{tPrefs("title")}</p>
    </div>
  );
}
