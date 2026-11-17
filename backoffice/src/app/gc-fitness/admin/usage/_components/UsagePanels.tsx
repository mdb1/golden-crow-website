// UsagePanels — the non-time-series parts of /gc-fitness/admin/usage (golden-crow-website#530):
// KPI tiles with deltas, feature adoption ranking, Corvo topics / n-grams / proposals, and the
// retention cohort table. Presentational (translations only), so they render as server
// components on the page and mount directly in tests.
//
// Bars here are plain HTML meters (one series, one color, value printed in text ink beside
// it), so they need no chart runtime and read without color.

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  formatDelta,
  formatShare,
  type AdoptionRow,
  type CorvoSummary,
  type RetentionRow,
} from "@/lib/gc-fitness/usage-model";

export interface KpiTile {
  id: string;
  label: string;
  value: string;
  /** Relative change vs the previous period; null = no comparable previous data. */
  delta: number | null;
  detail?: string;
}

export function KpiTiles({ tiles }: { tiles: KpiTile[] }) {
  const t = useTranslations("usageAdmin.kpi");
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="usage-kpis">
      {tiles.map((tile) => {
        const Icon = tile.delta === null || tile.delta === 0 ? ArrowRight : tile.delta > 0 ? ArrowUpRight : ArrowDownRight;
        return (
          <div key={tile.id} className="rounded-2xl border bg-card p-4 shadow-sm" data-testid={`usage-kpi-${tile.id}`}>
            <p className="text-xs text-muted-foreground">{tile.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums leading-tight" data-testid={`usage-kpi-${tile.id}-value`}>
              {tile.value}
            </p>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground" data-testid={`usage-kpi-${tile.id}-delta`}>
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {tile.delta === null ? t("noPrevious") : t("vsPrevious", { delta: formatDelta(tile.delta) })}
            </p>
            {tile.detail ? <p className="mt-1 text-xs text-muted-foreground">{tile.detail}</p> : null}
          </div>
        );
      })}
    </section>
  );
}

function Meter({ share, testId }: { share: number; testId?: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-muted" aria-hidden data-testid={testId}>
      <div className="h-2 rounded-full" style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%`, background: "var(--viz-1)" }} />
    </div>
  );
}

export function AdoptionPanel({ rows }: { rows: AdoptionRow[] }) {
  const t = useTranslations("usageAdmin.adoption");
  const tf = useTranslations("usageAdmin.features");
  const ta = useTranslations("usageAdmin.audience");
  const visible = rows.filter((r) => r.events > 0 || r.userDays > 0);
  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-sm" data-testid="usage-adoption">
      <h2 className="font-medium">{t("title")}</h2>
      <p className="mb-3 text-sm text-muted-foreground">{t("subtitle")}</p>
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {visible.map((r) => (
            <li key={r.feature} className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3 text-sm" data-testid={`usage-adoption-${r.feature}`}>
              <span className="truncate">
                {tf(r.feature)} <span className="text-xs text-muted-foreground">· {ta(r.audience)}</span>
              </span>
              <Meter share={r.share} />
              <span className="w-28 text-right tabular-nums" data-testid={`usage-adoption-${r.feature}-share`}>
                {formatShare(r.share)} <span className="text-xs text-muted-foreground">({r.events})</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function CorvoPanel({ summary }: { summary: CorvoSummary }) {
  const t = useTranslations("usageAdmin.corvo");
  const tt = useTranslations("usageAdmin.topics");
  const maxTopic = Math.max(1, ...summary.topics.map((x) => x.count));
  const resolved = summary.proposals.applied + summary.proposals.dismissed + summary.proposals.failed + summary.proposals.expired;
  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-sm" data-testid="usage-corvo">
      <h2 className="font-medium">{t("title")}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{t("subtitle")}</p>
      {summary.messages === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium">{t("topicsTitle")}</h3>
            <p className="mb-3 text-xs text-muted-foreground">{t("topicsHint")}</p>
            <ol className="flex flex-col gap-2">
              {summary.topics
                .filter((x) => x.count > 0)
                .map((x) => (
                  <li key={x.topic} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm" data-testid={`usage-topic-${x.topic}`}>
                    <span className="truncate">{tt(x.topic)}</span>
                    <Meter share={x.count / maxTopic} />
                    <span className="w-24 text-right tabular-nums" data-testid={`usage-topic-${x.topic}-value`}>
                      {x.count} <span className="text-xs text-muted-foreground">({formatShare(x.share)})</span>
                    </span>
                  </li>
                ))}
            </ol>
          </div>
          <div className="flex flex-col gap-5">
            <div>
              <h3 className="mb-2 text-sm font-medium">{t("proposalsTitle")}</h3>
              <p className="text-2xl font-semibold tabular-nums" data-testid="usage-corvo-acceptance">
                {formatShare(summary.acceptance)}
              </p>
              <p className="text-xs text-muted-foreground" data-testid="usage-corvo-proposals">
                {t("proposalsDetail", {
                  applied: summary.proposals.applied,
                  resolved,
                  dismissed: summary.proposals.dismissed,
                  expired: summary.proposals.expired,
                  pending: summary.proposals.pending,
                  created: summary.proposals.created,
                })}
              </p>
            </div>
            <div>
              <h3 className="mb-1 text-sm font-medium">{t("ngramsTitle")}</h3>
              <p className="mb-2 text-xs text-muted-foreground">{t("ngramsHint")}</p>
              {summary.ngrams.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("ngramsEmpty")}</p>
              ) : (
                <ul className="flex flex-wrap gap-2" data-testid="usage-corvo-ngrams">
                  {summary.ngrams.map((g) => (
                    <li key={g.t} className="rounded-full border px-3 py-1 text-sm">
                      <span>{g.t}</span> <span className="text-xs tabular-nums text-muted-foreground">{t("ngramCount", { users: g.users })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Sequential bin 0..5 for a share (0 = nobody → the surface). */
export function retentionLevel(share: number): number {
  if (share <= 0) return 0;
  if (share <= 0.2) return 1;
  if (share <= 0.4) return 2;
  if (share <= 0.6) return 3;
  if (share <= 0.8) return 4;
  return 5;
}

export function RetentionTable({ data, weekLabel }: { data: { asOf: string; rows: RetentionRow[] } | null; weekLabel: (week: string) => string }) {
  const t = useTranslations("usageAdmin.retention");
  const maxWeeks = data ? Math.max(0, ...data.rows.map((r) => r.active.length)) : 0;
  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-sm" data-testid="usage-retention">
      <h2 className="font-medium">{t("title")}</h2>
      <p className="mb-3 text-sm text-muted-foreground">{data ? t("subtitle", { asOf: data.asOf }) : t("subtitleEmpty")}</p>
      {!data || data.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm tabular-nums">
            <thead>
              <tr>
                <th scope="col" className="px-2 py-1 text-left font-medium text-muted-foreground">{t("cohort")}</th>
                <th scope="col" className="px-2 py-1 text-right font-medium text-muted-foreground">{t("size")}</th>
                {Array.from({ length: maxWeeks }, (_, k) => (
                  <th key={k} scope="col" className="px-2 py-1 text-center font-medium text-muted-foreground">
                    {t("week", { k })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.week} data-testid={`usage-retention-${row.week}`}>
                  <th scope="row" className="px-2 py-1 text-left font-normal">{weekLabel(row.week)}</th>
                  <td className="px-2 py-1 text-right">{row.size}</td>
                  {Array.from({ length: maxWeeks }, (_, k) => {
                    if (k >= row.active.length) return <td key={k} />;
                    const share = row.size > 0 ? row.active[k] / row.size : 0;
                    const level = retentionLevel(share);
                    return (
                      <td
                        key={k}
                        className="px-1 py-1 text-center"
                        data-testid={`usage-retention-${row.week}-${k}`}
                        data-level={level}
                        title={t("cellTitle", { active: row.active[k], size: row.size })}
                      >
                        <span
                          className="block rounded-md px-1 py-1"
                          style={{
                            background: `var(--viz-seq-${level})`,
                            color: level >= 4 ? "var(--viz-seq-ink-high)" : level === 0 ? "var(--muted-foreground)" : "var(--viz-seq-ink-low)",
                          }}
                        >
                          {formatShare(share)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
