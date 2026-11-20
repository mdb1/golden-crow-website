// CoachOverviewSections — #534: the presentational sections of the admin coach detail
// (KPIs, billing, nutrition + habits, challenges, checklist, Corvo, social, the coach's own
// activity and the pending invites). Translations only — no reads — so they render as
// server components on the page and mount directly in tests with fixtures.

import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  CoachBillingSummary,
  CoachChecklistSummary,
  CoachCorvoSummary,
  CoachNutritionSummary,
  PendingInviteRow,
} from "@/lib/gc-fitness/admin-coach-overview-model";
import type { CoachChallengeSummary } from "@/lib/gc-fitness/coach-challenges";
import { formatAppDevice, type ClientAppDevice } from "@/lib/gc-fitness/client-app-devices";
import type { BillingState, PaymentCovers } from "@/lib/gc-fitness/billing";

import { CoachCollectedChart } from "./CoachCollectedChart";
import { billingBadgeVariant, civilLabel, instantLabel, langOf, money, monthLabel } from "./overview-format";


function Stat({ label, value, testId, hint }: { label: string; value: ReactNode; testId?: string; hint?: ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-4" data-testid={testId}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Row({ label, value, testId }: { label: string; value: ReactNode; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm" data-testid={testId}>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium tabular-nums">{value}</span>
    </div>
  );
}

function totalsText(lang: "es" | "en", totals: Array<{ currency: string; amount: number }>): string {
  return totals.length === 0 ? "—" : totals.map((x) => money(lang, x.amount, x.currency)).join(" · ");
}

// ── KPIs ────────────────────────────────────────────────────────────────────────

export function CoachOverviewKpis({
  activeClients,
  engagement,
  billing,
}: {
  activeClients: number;
  engagement: { last7d: number; inactive30d: number; never: number };
  billing: CoachBillingSummary | null;
}) {
  const t = useTranslations("admin.coachDetail.overview.kpi");
  const lang = langOf(useLocale());
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="coach-overview-kpis">
      <Stat label={t("clients")} value={activeClients} testId="kpi-clients" />
      <Stat label={t("active7d")} value={engagement.last7d} testId="kpi-active7d" />
      <Stat label={t("inactive30d")} value={engagement.inactive30d + engagement.never} testId="kpi-inactive30d" />
      <Stat
        label={t("overdue")}
        value={billing ? billing.stateCounts.overdue : t("none")}
        hint={billing ? `${t("dueSoon")}: ${billing.stateCounts.due_soon}` : undefined}
        testId="kpi-overdue"
      />
      <Stat
        label={t("collectedThisMonth")}
        value={billing ? totalsText(lang, billing.collectedThisMonth) : t("none")}
        testId="kpi-collected"
      />
      <Stat
        label={t("expectedMonthly")}
        value={billing ? totalsText(lang, billing.expectedMonthly) : t("none")}
        testId="kpi-expected"
      />
    </section>
  );
}

// ── Billing ─────────────────────────────────────────────────────────────────────

export function CoachBillingCard({
  billing,
  clientNames,
  auditHref,
}: {
  billing: CoachBillingSummary | null;
  clientNames: Record<string, string>;
  auditHref?: string;
}) {
  const t = useTranslations("admin.coachDetail.overview.billing");
  const tp = useTranslations("payments");
  const tAudit = useTranslations("admin.coachDetail.overview");
  const lang = langOf(useLocale());

  const coversText = (c: PaymentCovers): string => {
    if (c.kind === "months") return tp("covers.months", { count: c.months ?? 1 });
    if (c.kind === "classes") return tp("covers.classes", { count: c.classes ?? 1 });
    return c.kind === "routine" ? tp("covers.routine") : tp("covers.other");
  };
  // Literal keys (checked by i18n-literal-keys.test), not `status.${…}`.
  const stateLabel: Record<BillingState, string> = {
    none: tp("status.none"),
    up_to_date: tp("status.up_to_date"),
    due_soon: tp("status.due_soon"),
    overdue: tp("status.overdue"),
  };
  const kindLabel: Record<string, string> = {
    per_class: tp("plans.kind.per_class"),
    class_pack: tp("plans.kind.class_pack"),
    per_routine: tp("plans.kind.per_routine"),
    monthly: tp("plans.kind.monthly"),
    months_pack: tp("plans.kind.months_pack"),
    custom: tp("plans.kind.custom"),
  };
  const methodLabel: Record<string, string> = {
    cash: tp("method.cash"),
    transfer: tp("method.transfer"),
    mercadopago: tp("method.mercadopago"),
    card: tp("method.card"),
    other: tp("method.other"),
  };

  return (
    <Card data-testid="coach-billing-card">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-xl">
          {t("title")}
          {auditHref ? (
            <a href={auditHref} className="text-xs font-normal text-primary hover:underline">
              {tAudit("auditLink")}
            </a>
          ) : null}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!billing ? (
          <p className="text-sm text-muted-foreground">{t("unavailable")}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2" data-testid="coach-billing-states">
              {(["overdue", "due_soon", "up_to_date", "none"] as const).map((s) => (
                <Badge key={s} variant={billingBadgeVariant(s)} data-testid={`coach-billing-state-${s}`}>
                  {stateLabel[s]}: {billing.stateCounts[s]}
                </Badge>
              ))}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">{t("plansTitle")}</h3>
              {billing.plans.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("plansEmpty")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table data-testid="coach-billing-plans">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("planCol.name")}</TableHead>
                        <TableHead>{t("planCol.kind")}</TableHead>
                        <TableHead>{t("planCol.price")}</TableHead>
                        <TableHead className="text-right">{t("planCol.clients")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {billing.plans.map((p) => (
                        <TableRow key={p.id} data-testid={`coach-plan-${p.id}`}>
                          <TableCell>
                            <span className="font-medium">{p.name}</span>{" "}
                            {p.archived ? <Badge variant="secondary">{t("archived")}</Badge> : null}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{kindLabel[p.kind] ?? p.kind}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {money(lang, p.amount, p.currency)}
                            <span className="ml-1 text-xs text-muted-foreground">
                              {p.periodMonths
                                ? t("perMonths", { count: p.periodMonths })
                                : p.classCount
                                  ? t("perClasses", { count: p.classCount })
                                  : ""}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{p.clients}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {billing.chartCurrency === null ? (
                <p className="text-sm text-muted-foreground">{t("monthlyEmpty")}</p>
              ) : (
                <>
                  <CoachCollectedChart monthly={billing.monthly} currency={billing.chartCurrency} />
                  <p className="text-sm" data-testid="coach-billing-total12m">
                    <span className="text-muted-foreground">{t("total12m")}: </span>
                    <span className="font-medium">{totalsText(lang, billing.collectedInWindow)}</span>
                  </p>
                  <details>
                    <summary className="cursor-pointer text-xs text-primary">{t("tableView")}</summary>
                    <Table data-testid="coach-billing-monthly-table">
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("month")}</TableHead>
                          <TableHead className="text-right">{t("payments")}</TableHead>
                          <TableHead className="text-right">{tp("amount")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {billing.monthly.map((m) => (
                          <TableRow key={`${m.month}-${m.currency}`}>
                            <TableCell>{monthLabel(lang, m.month)}</TableCell>
                            <TableCell className="text-right tabular-nums">{m.payments}</TableCell>
                            <TableCell className="text-right tabular-nums">{money(lang, m.amount, m.currency)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </details>
                </>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">{t("recentTitle")}</h3>
              {billing.recentPayments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("recentEmpty")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table data-testid="coach-billing-payments">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("recentCol.date")}</TableHead>
                        <TableHead>{t("recentCol.client")}</TableHead>
                        <TableHead>{t("recentCol.amount")}</TableHead>
                        <TableHead>{t("recentCol.method")}</TableHead>
                        <TableHead>{t("recentCol.covers")}</TableHead>
                        <TableHead>{t("recentCol.plan")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {billing.recentPayments.map((p) => (
                        <TableRow key={p.id} data-testid={`coach-payment-${p.id}`} className={p.voidedAt ? "opacity-60" : undefined}>
                          <TableCell className="whitespace-nowrap text-xs">{civilLabel(lang, p.paidCivil)}</TableCell>
                          <TableCell className="text-sm">
                            {clientNames[p.clientId] ?? (
                              <span className="text-muted-foreground">
                                {p.clientId} · {t("formerClient")}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            <span className={p.voidedAt ? "line-through" : undefined}>{money(lang, p.amount, p.currency)}</span>{" "}
                            {p.voidedAt ? <Badge variant="secondary">{t("voided")}</Badge> : null}
                          </TableCell>
                          <TableCell className="text-xs">
                            {methodLabel[p.method] ?? p.method}
                            {p.methodNote ? <span className="text-muted-foreground"> · {p.methodNote}</span> : null}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{coversText(p.covers)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{p.planName ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {billing.voidedCount > 0 ? t("voidedCount", { count: billing.voidedCount }) : null}
                {billing.voidedCount > 0 && billing.paymentsFromFormerClients > 0 ? " · " : null}
                {billing.paymentsFromFormerClients > 0
                  ? t("formerClients", { count: billing.paymentsFromFormerClients })
                  : null}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Nutrition + habits ──────────────────────────────────────────────────────────

export function CoachProgramsCard({
  nutrition,
  habits,
}: {
  nutrition: CoachNutritionSummary | null;
  habits: { active: number; archived: number; templates: number } | null;
}) {
  const t = useTranslations("admin.coachDetail.overview.content");
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card size="sm" data-testid="coach-nutrition-card">
        <CardHeader>
          <CardTitle>{t("nutritionTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {nutrition ? (
            <>
              <Row label={t("nutritionTemplates")} value={nutrition.templates} testId="coach-nutrition-templates" />
              <Row label={t("nutritionPlans")} value={nutrition.plans} />
              <Row label={t("nutritionActive")} value={nutrition.clientsWithActivePlan} testId="coach-nutrition-active" />
              <Row label={t("nutritionLapsed")} value={nutrition.clientsWithLapsedPlan} testId="coach-nutrition-lapsed" />
              <Row
                label={t("nutritionAdherence")}
                value={nutrition.avgPercent7d === null ? "—" : `${nutrition.avgPercent7d}%`}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("unavailable")}</p>
          )}
        </CardContent>
      </Card>
      <Card size="sm" data-testid="coach-habits-card">
        <CardHeader>
          <CardTitle>{t("habitsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {habits ? (
            <>
              <Row label={t("habitsActive")} value={habits.active} testId="coach-habits-active" />
              <Row label={t("habitsArchived")} value={habits.archived} testId="coach-habits-archived" />
              <Row label={t("habitsTemplates")} value={habits.templates} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("unavailable")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Challenges ──────────────────────────────────────────────────────────────────

export function CoachChallengesCard({ challenges }: { challenges: CoachChallengeSummary[] | null }) {
  const t = useTranslations("admin.coachDetail.overview.challenges");
  const lang = langOf(useLocale());
  return (
    <Card data-testid="coach-challenges-card">
      <CardHeader>
        <CardTitle className="text-xl">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {!challenges || challenges.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("col.name")}</TableHead>
                  <TableHead>{t("col.dates")}</TableHead>
                  <TableHead>{t("col.members")}</TableHead>
                  <TableHead>{t("col.leader")}</TableHead>
                  <TableHead>{t("col.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {challenges.map((c) => (
                  <TableRow key={c.id} data-testid={`coach-challenge-${c.id}`}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {civilLabel(lang, c.startDate)} → {civilLabel(lang, c.endDate)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {c.joinedCount} / {c.invitedCount}
                    </TableCell>
                    <TableCell className="text-xs">{c.standings[0]?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === "active" ? "success" : "secondary"}>
                        {c.status === "active" ? t("active") : t("ended")}
                      </Badge>{" "}
                      {c.hidden ? <Badge variant="destructive">{t("hidden")}</Badge> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Checklist + Corvo + social ──────────────────────────────────────────────────

export function CoachEngagementCards({
  checklist,
  corvo,
  social,
  timezone,
}: {
  checklist: CoachChecklistSummary | null;
  corvo: CoachCorvoSummary | null;
  social: { handle: string | null; visibility: string | null; suspended: boolean; publicRoutines: number } | null;
  timezone: string;
}) {
  const t = useTranslations("admin.coachDetail.overview");
  const lang = langOf(useLocale());
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card size="sm" data-testid="coach-checklist-card">
        <CardHeader>
          <CardTitle>{t("checklist.title")}</CardTitle>
          {checklist ? (
            <CardDescription data-testid="coach-checklist-summary">
              {t("checklist.summary", { open: checklist.open, overdue: checklist.overdue, done: checklist.done })}
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          {!checklist || checklist.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("checklist.empty")}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {checklist.upcoming.map((i) => (
                <li key={i.id} className="flex justify-between gap-2">
                  <span className="truncate">{i.title}</span>
                  <span className={`whitespace-nowrap text-xs ${i.overdue ? "text-destructive" : "text-muted-foreground"}`}>
                    {instantLabel(lang, i.dueAtISO, timezone)}
                    {i.overdue ? ` · ${t("checklist.overdue")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card size="sm" data-testid="coach-corvo-card">
        <CardHeader>
          <CardTitle>{t("corvo.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {corvo ? (
            <>
              <Row label={t("corvo.using")} value={corvo.clientsUsing} testId="coach-corvo-using" />
              <Row label={t("corvo.active7d")} value={corvo.activeLast7d} />
              <Row label={t("corvo.turns")} value={corvo.turnsTotal} testId="coach-corvo-turns" />
              <Row label={t("corvo.consented")} value={corvo.consented} />
              <Row label={t("corvo.last")} value={instantLabel(lang, corvo.lastMessageAtMs, timezone)} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </CardContent>
      </Card>
      <Card size="sm" data-testid="coach-social-card">
        <CardHeader>
          <CardTitle>{t("social.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {social ? (
            <>
              <Row label={t("social.handle")} value={social.handle ? `@${social.handle}` : "—"} />
              <Row label={t("social.visibility")} value={social.visibility ?? "—"} />
              <Row label={t("social.publicRoutines")} value={social.publicRoutines} />
              {social.suspended ? <Badge variant="destructive">{t("social.suspended")}</Badge> : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("social.none")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── The coach's own activity ────────────────────────────────────────────────────

export function CoachActivityCard({
  activity,
  timezone,
}: {
  activity: {
    lastSignInISO: string | null;
    lastAppOpenISO: string | null;
    accountCreatedISO: string | null;
    lastCoachActionISO: string | null;
    lastCoachActionKind: string | null;
    devices: ClientAppDevice[];
    entitlementTier: "premium" | "free";
    timezone: string | null;
  };
  timezone: string;
}) {
  const t = useTranslations("admin.coachDetail.overview.activity");
  const lang = langOf(useLocale());
  return (
    <Card size="sm" data-testid="coach-activity-card">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-x-8 sm:grid-cols-2">
        <Row
          label={t("lastAction")}
          value={
            activity.lastCoachActionISO
              ? `${instantLabel(lang, activity.lastCoachActionISO, timezone, true)}${
                  activity.lastCoachActionKind ? ` · ${activity.lastCoachActionKind}` : ""
                }`
              : "—"
          }
          testId="coach-activity-last-action"
        />
        <Row label={t("lastSignIn")} value={instantLabel(lang, activity.lastSignInISO, timezone, true)} />
        <Row label={t("lastAppOpen")} value={instantLabel(lang, activity.lastAppOpenISO, timezone, true)} />
        <Row label={t("created")} value={instantLabel(lang, activity.accountCreatedISO, timezone)} />
        <Row
          label={t("app")}
          value={activity.devices.length === 0 ? t("noDevices") : activity.devices.map((d) => formatAppDevice(d)).join(" · ")}
          testId="coach-activity-app"
        />
        <Row label={t("subscription")} value={activity.entitlementTier} />
        <Row label={t("timezone")} value={activity.timezone ?? "—"} />
      </CardContent>
    </Card>
  );
}

// ── Pending invites ─────────────────────────────────────────────────────────────

const INVITE_STATUSES = ["sent", "failed", "skipped"] as const;
function inviteKey(s: string | null): "sent" | "failed" | "skipped" | "none" {
  return (INVITE_STATUSES as readonly string[]).includes(s ?? "") ? (s as "sent" | "failed" | "skipped") : "none";
}

export function PendingInvitesTable({
  invites,
  timezone,
  actions = {},
}: {
  invites: PendingInviteRow[];
  timezone: string;
  actions?: Record<string, ReactNode>;
}) {
  const t = useTranslations("admin.coachDetail.overview.invites");
  const tPending = useTranslations("admin.coachDetail.pending");
  const tc = useTranslations("admin.common");
  const lang = langOf(useLocale());
  const statusLabel = {
    sent: t("status.sent"),
    failed: t("status.failed"),
    skipped: t("status.skipped"),
    none: t("status.none"),
  };
  const variant = (s: string | null) => (s === "sent" ? "success" : s === "failed" ? "destructive" : "secondary");
  return (
    <Card data-testid="coach-invites-card">
      <CardHeader>
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tc("email")}</TableHead>
                <TableHead>{tc("name")}</TableHead>
                <TableHead>{t("col.invited")}</TableHead>
                <TableHead>{t("col.email")}</TableHead>
                <TableHead className="text-right">{tc("action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.length === 0 ? (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={5}>
                    {tPending("empty")}
                  </TableCell>
                </TableRow>
              ) : (
                invites.map((i) => (
                  <TableRow key={i.email} data-testid={`coach-invite-${i.email}`}>
                    <TableCell>{i.email}</TableCell>
                    <TableCell>{i.displayName || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{instantLabel(lang, i.createdAtISO, timezone)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      <Badge variant={variant(i.inviteStatus)}>{statusLabel[inviteKey(i.inviteStatus)]}</Badge>
                      {i.inviteSentAtISO ? (
                        <span className="ml-1 text-muted-foreground">
                          {t("sentAt", { date: instantLabel(lang, i.inviteSentAtISO, timezone) })}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">{actions[i.email] ?? null}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
