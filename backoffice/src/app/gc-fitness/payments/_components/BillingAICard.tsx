"use client";

// gc-fitness #1696 — «Análisis con Corvo» al pie del Tablero de cobros.
//
//   - «Analizar facturación con IA» → texto: qué pasó, Riesgos, Qué hacer.
//   - «Imagen del mes» → Corvo escribe titular, recomendación y elige 3 datos; la IMAGEN la dibuja
//     el mismo pipeline de las tarjetas de entrenamiento (`ShareBillingMonthCard` →
//     `ShareCardRenderer` + html-to-image) con los números de ESTE tablero (`statValue`).
//   - Tope por coach y por mes (lo decide el callable): «Te quedan N de M este mes».
//   - Lo último generado del mes queda guardado: abrir la pestaña lo muestra sin gastar cupo.
// Las dos Server Actions devuelven su error (#1104); acá sólo se mapea a un texto.

import { useEffect, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

import { ShareBillingMonthCard } from "@/components/gc-fitness/share-workout-card";
import { Button } from "@/components/ui/button";
import {
  statValue,
  type BillingAIErrorKind,
  type BillingAIKind,
  type BillingAIQuota,
  type BillingAnalysis,
  type BillingCard,
  type CardStatKey,
} from "@/lib/gc-fitness/billing-ai";
import { getBillingAIState, runBillingAI } from "@/lib/gc-fitness/billing-ai-actions";
import type { BillingDashboard } from "@/lib/gc-fitness/billing-dashboard";
import { buildBillingMonthShareModel, monthTitle } from "@/lib/gc-fitness/billing-month-share";
import { noteIfStaleDeployment } from "@/lib/gc-fitness/stale-deployment";

interface Stored {
  month: string;
  coachName: string;
  analysis: BillingAnalysis | null;
  card: BillingCard | null;
  quota: BillingAIQuota;
}

export function BillingAICard({ dashboard }: { dashboard: BillingDashboard }) {
  const t = useTranslations("payments.ai");
  const lang: "es" | "en" = useLocale() === "en" ? "en" : "es";
  const [state, setState] = useState<Stored | null>(null);
  const [loadError, setLoadError] = useState<BillingAIErrorKind | null>(null);
  const [errors, setErrors] = useState<Partial<Record<BillingAIKind, BillingAIErrorKind>>>({});
  const [running, setRunning] = useState<BillingAIKind | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    getBillingAIState()
      .then((r) => {
        if (!alive) return;
        if (r.ok) setState({ month: r.month, coachName: r.coachName, analysis: r.analysis, card: r.card, quota: r.quota });
        else setLoadError(r.error);
      })
      .catch((err) => {
        noteIfStaleDeployment(err);
        if (alive) setLoadError("generic");
      });
    return () => {
      alive = false;
    };
  }, []);

  function errorText(kind: BillingAIErrorKind): string {
    switch (kind) {
      case "quota":
        return t("error.quota");
      case "unavailable":
        return t("error.unavailable");
      case "forbidden":
        return t("error.forbidden");
      default:
        return t("error.generic");
    }
  }

  function statLabel(key: CardStatKey): string {
    switch (key) {
      case "collected":
        return t("stat.collected");
      case "collectedDelta":
        return t("stat.collectedDelta");
      case "mrr":
        return t("stat.mrr");
      case "paying":
        return t("stat.paying");
      case "newClients":
        return t("stat.newClients");
      case "churned":
        return t("stat.churned");
      case "avgTicket":
        return t("stat.avgTicket");
      case "projection3":
        return t("stat.projection3");
      case "projection6":
        return t("stat.projection6");
      default:
        return t("stat.projection12");
    }
  }

  function run(kind: BillingAIKind) {
    if (running) return;
    setRunning(kind);
    setErrors((e) => ({ ...e, [kind]: undefined }));
    startTransition(async () => {
      try {
        const r = await runBillingAI({ kind });
        if (r.ok) {
          setState((s) =>
            s
              ? {
                  ...s,
                  month: r.month,
                  quota: r.quota,
                  analysis: r.analysis ?? s.analysis,
                  card: r.card ?? s.card,
                }
              : s,
          );
        } else {
          setErrors((e) => ({ ...e, [kind]: r.error }));
          const quota = r.quota;
          if (quota) setState((s) => (s ? { ...s, quota } : s));
        }
      } catch (err) {
        noteIfStaleDeployment(err);
        setErrors((e) => ({ ...e, [kind]: "generic" }));
      } finally {
        setRunning(null);
      }
    });
  }

  const shareModel = useMemo(() => {
    if (!state?.card) return null;
    return buildBillingMonthShareModel({
      card: state.card,
      month: state.month,
      coachName: state.coachName,
      lang,
      values: (key) => statValue(key, dashboard),
      labels: {
        eyebrow: t("cardEyebrow", { month: monthTitle(state.month, lang) }),
        recommendation: t("cardRecommendation"),
        stat: statLabel,
      },
    });
    // statLabel/t are stable for a render's locale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.card, state?.month, state?.coachName, lang, dashboard]);

  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-sm" data-testid="billing-ai">
      <div className="mb-1 flex items-center gap-2">
        <Sparkles className="size-4 text-primary" aria-hidden="true" />
        <h3 className="font-medium">{t("title")}</h3>
      </div>
      <p className="mb-4 text-xs text-muted-foreground" data-testid="billing-ai-disclosure">
        {t("disclosure")}
      </p>

      {loadError ? (
        <p className="text-sm text-muted-foreground" data-testid="billing-ai-load-error">
          {errorText(loadError)}
        </p>
      ) : !state ? null : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Análisis en texto */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => run("analysis")}
                disabled={running !== null || state.quota.analysis.remaining <= 0}
                data-testid="billing-ai-analyze"
              >
                {running === "analysis" ? t("working") : t("analyze")}
              </Button>
              <span className="text-xs text-muted-foreground" data-testid="billing-ai-analysis-remaining">
                {t("remaining", { remaining: state.quota.analysis.remaining, limit: state.quota.analysis.limit })}
              </span>
            </div>
            {errors.analysis ? (
              <p className="text-sm text-destructive" role="alert" data-testid="billing-ai-analysis-error">
                {errorText(errors.analysis)}
              </p>
            ) : null}
            {state.analysis ? (
              <div className="flex flex-col gap-3 text-sm" data-testid="billing-ai-analysis">
                <p className="whitespace-pre-line">{state.analysis.summary}</p>
                {state.analysis.risks.length > 0 ? (
                  <div>
                    <h4 className="mb-1 font-medium">{t("risks")}</h4>
                    <ul className="list-disc pl-5" data-testid="billing-ai-risks">
                      {state.analysis.risks.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {state.analysis.actions.length > 0 ? (
                  <div>
                    <h4 className="mb-1 font-medium">{t("actions")}</h4>
                    <ul className="list-disc pl-5" data-testid="billing-ai-actions">
                      {state.analysis.actions.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Imagen del mes */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                onClick={() => run("card")}
                disabled={running !== null || state.quota.card.remaining <= 0}
                data-testid="billing-ai-card"
              >
                {running === "card" ? t("working") : t("card")}
              </Button>
              <span className="text-xs text-muted-foreground" data-testid="billing-ai-card-remaining">
                {t("remaining", { remaining: state.quota.card.remaining, limit: state.quota.card.limit })}
              </span>
            </div>
            {errors.card ? (
              <p className="text-sm text-destructive" role="alert" data-testid="billing-ai-card-error">
                {errorText(errors.card)}
              </p>
            ) : null}
            {shareModel ? (
              <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4" data-testid="billing-ai-card-preview">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">{shareModel.eyebrow}</p>
                <p className="text-lg font-semibold">{shareModel.title}</p>
                <div className="grid grid-cols-3 gap-2">
                  {shareModel.stats.map((s, i) => (
                    <div key={i} className="rounded-lg border bg-card p-2 text-center" data-testid="billing-ai-card-stat">
                      <div className="font-semibold tabular-nums">{s.value}</div>
                      <div className="text-xs text-muted-foreground">{s.label}</div>
                    </div>
                  ))}
                </div>
                <p className="text-sm">
                  <span className="text-muted-foreground">{shareModel.rowsCaption}: </span>
                  {shareModel.note}
                </p>
                <div aria-label={t("cardShare")}>
                  <ShareBillingMonthCard model={shareModel} />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
