"use client";

// CoachWeeklySummaryCard — gc-fitness #1347, «Resumen de la semana (IA)».
//
// Read-only: it never writes the client's data. States:
//   • empty     — no summary this ISO week yet → «Generar resumen»;
//   • loading   — the callable is running (a few seconds);
//   • ready     — headline, sections, «Para revisar» flags + «Regenerar»;
//   • error     — generic / model unavailable / not allowed (opted out);
//   • quota     — the coach used today's 20 → buttons disabled.
// The consent line («Generado con IA a partir de los datos que ya ves de tu
// cliente») is ALWAYS visible: it is the coach-facing half of the #1347
// consent decision (the other half is the web privacy policy).

import { useState, useTransition } from "react";
import { AlertTriangle, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  generateCoachWeeklySummary,
  type CoachSummaryLoadResult,
} from "@/lib/gc-fitness/coach-ai-summary-actions";
import type {
  CoachSummaryErrorKind,
  CoachSummaryQuota,
  CoachWeeklySummary,
} from "@/lib/gc-fitness/coach-ai-summary-model";

function formatGeneratedAt(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function CoachWeeklySummaryCard({
  clientId,
  initial,
}: {
  clientId: string;
  initial: CoachSummaryLoadResult;
}) {
  const t = useTranslations("clients.detail.aiSummary");
  const locale = useLocale();
  const [summary, setSummary] = useState<CoachWeeklySummary | null>(
    initial.ok ? initial.summary : null,
  );
  const [quota, setQuota] = useState<CoachSummaryQuota | null>(
    initial.ok ? initial.quota : null,
  );
  const [error, setError] = useState<CoachSummaryErrorKind | null>(
    initial.ok ? null : initial.error,
  );
  const [isPending, startTransition] = useTransition();

  const quotaExhausted = quota !== null && quota.remaining <= 0;

  function run(force: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await generateCoachWeeklySummary(clientId, { force });
      if (result.ok) {
        setSummary(result.summary);
        setQuota(result.quota);
        return;
      }
      if (result.quota) setQuota(result.quota);
      if (result.error === "quota" && !result.quota && quota) {
        setQuota({ ...quota, used: quota.limit, remaining: 0 });
      }
      setError(result.error);
    });
  }

  const generatedAt = summary
    ? formatGeneratedAt(summary.generatedAtISO, locale)
    : null;

  return (
    <section
      className="rounded-[1.25rem] border border-border bg-card p-5 shadow-sm"
      data-testid="coach-ai-summary-card"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-medium">
            <Sparkles className="size-4" aria-hidden />
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("consent")}</p>
        </div>
        <div className="flex items-center gap-2">
          {quota ? (
            <span className="text-xs text-muted-foreground" data-testid="coach-ai-summary-quota">
              {t("quota", { remaining: quota.remaining, limit: quota.limit })}
            </span>
          ) : null}
          {summary ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => run(true)}
              disabled={isPending || quotaExhausted}
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="size-4" aria-hidden />
              )}
              {t("regenerate")}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => run(false)}
              disabled={isPending || quotaExhausted}
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="size-4" aria-hidden />
              )}
              {t("generate")}
            </Button>
          )}
        </div>
      </div>

      {isPending ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground" role="status">
          {t("loading")}
        </p>
      ) : null}

      {error ? (
        <p
          className="mb-3 flex items-start gap-2 rounded-md border border-destructive/40 p-3 text-sm text-destructive"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t(`errors.${error}`)}
        </p>
      ) : null}

      {!error && quotaExhausted ? (
        <p className="mb-3 text-sm text-muted-foreground">{t("errors.quota")}</p>
      ) : null}

      {!isPending && !summary && !error ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : null}

      {!isPending && summary ? (
        <div className="grid gap-3">
          <p className="font-medium" data-testid="coach-ai-summary-headline">
            {summary.headline}
          </p>
          <dl className="grid gap-2">
            {summary.sections.map((section) => (
              <div key={section.key} className="rounded-md border p-3">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {section.title || t(`sections.${section.key}`)}
                </dt>
                <dd className="mt-1 whitespace-pre-line text-sm">{section.text}</dd>
              </div>
            ))}
          </dl>
          {summary.flags.length > 0 ? (
            <div>
              <p className="text-sm font-medium">{t("flagsTitle")}</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {summary.flags.map((flag, i) => (
                  <li key={i}>{flag}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {t("window", { from: summary.windowFrom, to: summary.windowTo })}
            {generatedAt ? ` · ${t("generatedAt", { date: generatedAt })}` : ""}
            {` · ${t("disclaimer")}`}
          </p>
        </div>
      ) : null}
    </section>
  );
}
