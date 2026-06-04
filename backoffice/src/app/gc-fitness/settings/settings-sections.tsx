"use client";

// settings-sections.tsx
//
// Redesigned grouped settings rows for /gc-fitness/settings (2026-06 restyle).
//
// Pure presentation + light client interactivity — NO behavior change to the
// underlying controls. The real functional controls are reused as-is:
//   - Idioma   → <LanguageForm> (the `updatePreferredLocale` Server Action)
//   - Tema     → <ThemeSegmentedControl> (Claro/Oscuro pill; localStorage +
//                data-theme — reuses the appearance logic, current theme gold)
//   - Respuestas rápidas → <QuickRepliesForm> (the `updateChatQuickReplies`
//                          Server Action + useFieldArray editor)
//
// Each "row" with an editor is an expandable disclosure (button → chevron
// rotates, panel reveals the existing form). Rows are grouped under labelled
// sections (CUENTA / SUSCRIPCIÓN / PREFERENCIAS) matching the reference design.

import { useEffect, useState, type ReactNode } from "react";
import {
  ChevronRight,
  Languages,
  MessageSquareText,
  MoonStar,
  SunMedium,
  SunMoon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { LanguageForm } from "./language-form";
import { QuickRepliesForm } from "./quick-replies-form";

type AppearanceMode = "light" | "dark";

const APPEARANCE_STORAGE_KEY = "gc-fitness-appearance";

function resolveAppearance(value: string | null | undefined): AppearanceMode {
  return value === "dark" ? "dark" : "light";
}

function applyAppearance(mode: AppearanceMode) {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
  document.documentElement.classList.toggle("dark", mode === "dark");
  window.localStorage.setItem(APPEARANCE_STORAGE_KEY, mode);
}

/**
 * Clear two-option segmented control (Claro / Oscuro). The CURRENTLY-ACTIVE
 * theme is highlighted gold; selecting an option applies + persists it.
 *
 * Reuses the same appearance logic as the locked
 * `gc-fitness-appearance-toggle.tsx` primitive (localStorage key
 * `gc-fitness-appearance`, `document.documentElement.dataset.theme`,
 * `classList.toggle("dark")`, `style.colorScheme`) so the flip is real and
 * persistent. On mount it reads the REAL current theme (DOM/localStorage),
 * never a hardcoded default.
 */
function ThemeSegmentedControl() {
  const tTheme = useTranslations("settings.theme");
  const [mounted, setMounted] = useState(false);
  const [appearance, setAppearance] = useState<AppearanceMode>("light");

  useEffect(() => {
    const fromStorage =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    const fromDOM = document.documentElement.dataset.theme;
    const current = resolveAppearance(fromStorage ?? fromDOM);
    applyAppearance(current);
    setAppearance(current);
    setMounted(true);
  }, []);

  function select(mode: AppearanceMode) {
    if (mode === appearance) return;
    applyAppearance(mode);
    setAppearance(mode);
  }

  const options: Array<{
    mode: AppearanceMode;
    label: string;
    icon: ReactNode;
  }> = [
    { mode: "light", label: tTheme("light"), icon: <SunMedium /> },
    { mode: "dark", label: tTheme("dark"), icon: <MoonStar /> },
  ];

  return (
    <div
      role="radiogroup"
      aria-label={tTheme("title")}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 p-1"
    >
      {options.map((opt) => {
        const active = appearance === opt.mode;
        return (
          <button
            key={opt.mode}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={!mounted}
            onClick={() => select(opt.mode)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 [&>svg]:size-3.5",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

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
        "flex flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3.5 sm:flex-nowrap",
        !last && "border-b border-border",
      )}
    >
      <IconChip tone={tone} icon={icon} />
      <div className="min-w-0 flex-1 basis-[calc(100%-3.25rem)] sm:basis-auto">
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        {value ? (
          <p className="truncate text-sm text-muted-foreground">{value}</p>
        ) : null}
      </div>
      {trailing ? (
        <div className="w-full shrink-0 sm:w-auto">{trailing}</div>
      ) : null}
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
            trailing={<ThemeSegmentedControl />}
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
