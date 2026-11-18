"use client";

// RelativeTime.tsx — «hace 2 h», «ayer», «hace 3 días» / "2 hr. ago", "yesterday".
//
// Pure presentational client component. Computes once on render (no clock
// state — re-renders only when the parent re-renders, which is acceptable
// for a roster refreshed on every navigation).
//
// golden-crow-website#535 — it used to build ENGLISH strings by hand ("2h ago",
// "yesterday") in a Spanish-first portal. It now goes through
// `Intl.RelativeTimeFormat` in the UI locale, so the wording is the platform's
// (and matches the apps' `RelativeDateTimeFormatter` / `DateUtils`), with the
// same buckets as before. The hover title is the full local date, not an ISO.
//
// Time travel safety: future timestamps (clock drift, server-clock skew,
// or a legitimately future `scheduledFor`) render as "now" rather
// than throwing — graceful degradation per T-11-05-TIMESTAMP-DRIFT.

import { useLocale, useTranslations } from "next-intl";

export interface RelativeTimeProps {
  /** ISO-8601 string (e.g. "2026-05-20T18:00:00Z"). */
  iso: string | null;
  /** Shown when iso === null. Defaults to the localized «Sin actividad». */
  fallback?: string;
}

// Intl constructors are expensive and a roster renders one of these per card:
// build each formatter once per locale.
const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>();
const titleFormatters = new Map<string, Intl.DateTimeFormat>();
function bcp47(locale: string): string {
  return locale === "en" ? "en-US" : "es-AR";
}
function relativeFormatter(locale: string): Intl.RelativeTimeFormat {
  const tag = bcp47(locale);
  let f = relativeFormatters.get(tag);
  if (!f) {
    f = new Intl.RelativeTimeFormat(tag, { numeric: "auto", style: "short" });
    relativeFormatters.set(tag, f);
  }
  return f;
}
function titleFormatter(locale: string): Intl.DateTimeFormat {
  const tag = bcp47(locale);
  let f = titleFormatters.get(tag);
  if (!f) {
    f = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short" });
    titleFormatters.set(tag, f);
  }
  return f;
}

/** The bucketed relative label (pure; exported for tests). */
export function formatRelativeLabel(iso: string, nowMs: number, locale: string): string | null {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const rtf = relativeFormatter(locale);
  const diffMs = Math.max(0, nowMs - then.getTime());
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (sec < 60) return rtf.format(0, "second");
  if (min < 60) return rtf.format(-min, "minute");
  if (hr < 24) return rtf.format(-hr, "hour");
  if (day < 7) return rtf.format(-day, "day");
  if (day < 30) return rtf.format(-Math.floor(day / 7), "week");
  if (day < 365) return rtf.format(-Math.floor(day / 30), "month");
  return rtf.format(-Math.floor(day / 365), "year");
}

export function RelativeTime({ iso, fallback }: RelativeTimeProps) {
  const locale = useLocale();
  const t = useTranslations("dashboard");
  const empty = fallback ?? t("noActivity");
  const label = iso ? formatRelativeLabel(iso, Date.now(), locale) : null;
  if (!iso || label === null) {
    return <span className="text-muted-foreground">{empty}</span>;
  }
  const title = titleFormatter(locale).format(new Date(iso));
  return (
    <time dateTime={iso} title={title} suppressHydrationWarning>
      {label}
    </time>
  );
}
