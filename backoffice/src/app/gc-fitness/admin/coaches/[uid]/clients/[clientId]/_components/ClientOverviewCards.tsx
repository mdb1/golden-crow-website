// ClientOverviewCards — golden-crow-website#534 (PR 2): the extra sections of the admin
// client drill-down — summary tiles, account + app, subscription, billing with this coach,
// goals / notes / chat, Corvo. Presentational (translations only): server components on
// the page, mounted directly in tests with fixtures.

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
import type { ClientAdminOverview } from "@/lib/gc-fitness/admin-client-overview";
import { daysAgo, type LastActivityKind } from "@/lib/gc-fitness/admin-coach-overview-model";
import type { BillingState, PaymentCovers } from "@/lib/gc-fitness/billing";
import { formatAppDevice } from "@/lib/gc-fitness/client-app-devices";

import {
  billingBadgeVariant,
  civilLabel,
  instantLabel,
  langOf,
  money,
} from "../../../_components/overview-format";


function Field({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm" data-testid={testId}>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

function Tile({ label, value, hint, testId }: { label: string; value: ReactNode; hint?: ReactNode; testId?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4" data-testid={testId}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function ClientOverviewTiles({ overview }: { overview: ClientAdminOverview }) {
  const t = useTranslations("admin.clientDetail.overview");
  const tk = useTranslations("admin.coachDetail.overview.clients");
  const tp = useTranslations("payments");
  // Literal keys (checked by i18n-literal-keys.test), not `status.${…}`.
  const stateLabel: Record<BillingState, string> = {
    none: tp("status.none"),
    up_to_date: tp("status.up_to_date"),
    due_soon: tp("status.due_soon"),
    overdue: tp("status.overdue"),
  };
  const kindLabel: Record<LastActivityKind, string> = {
    workout: tk("activityKind.workout"),
    habit: tk("activityKind.habit"),
    photo: tk("activityKind.photo"),
    corvo: tk("activityKind.corvo"),
    app_open: tk("activityKind.app_open"),
  };
  const { lastActivity, stats, billing, nowMs } = overview;
  const d = daysAgo(lastActivity.atMs, nowMs);
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="client-overview-tiles">
      <Tile
        label={t("tiles.lastActivity")}
        value={d === null ? tk("never") : d === 0 ? tk("today") : tk("daysAgo", { days: d })}
        hint={lastActivity.kind ? kindLabel[lastActivity.kind] : undefined}
        testId="client-tile-activity"
      />
      <Tile
        label={t("tiles.compliance")}
        value={stats ? `${Math.round(stats.thisWeekComplianceRatio * 100)}%` : "—"}
        hint={
          stats && stats.workoutsScheduledThisMonth > 0
            ? tk("workoutsMonth", { done: stats.workoutsCompletedThisMonth, total: stats.workoutsScheduledThisMonth })
            : undefined
        }
        testId="client-tile-compliance"
      />
      <Tile
        label={t("tiles.missed7d")}
        value={stats ? stats.missedWorkoutsLast7Days : "—"}
        testId="client-tile-missed"
      />
      <Tile
        label={t("tiles.billing")}
        value={billing ? stateLabel[billing.state] : "—"}
        hint={billing?.planName ?? undefined}
        testId="client-tile-billing"
      />
    </section>
  );
}

export function ClientAccountCard({ overview }: { overview: ClientAdminOverview }) {
  const t = useTranslations("admin.coachlessProfile.account");
  const ts = useTranslations("admin.coachlessProfile.subscription");
  const to = useTranslations("admin.clientDetail.overview");
  const lang = langOf(useLocale());
  const { account, entitlement, timezone } = overview;
  return (
    <Card size="sm" data-testid="client-account-card">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-x-8 sm:grid-cols-2">
        <Field label={t("signedUp")}>{instantLabel(lang, account.createdAtISO, timezone)}</Field>
        <Field label={t("lastSignIn")}>{instantLabel(lang, account.lastSignInISO, timezone, true)}</Field>
        <Field label={to("lastAppOpen")}>{instantLabel(lang, account.lastAppOpenISO, timezone, true)}</Field>
        <Field label={t("app")} testId="client-account-app">
          {account.devices.length === 0 ? to("noDevices") : account.devices.map((d) => formatAppDevice(d)).join(" · ")}
        </Field>
        <Field label={t("providers")}>{account.providers.join(", ") || "—"}</Field>
        <Field label={t("timezone")}>{account.timezone ?? "—"}</Field>
        <Field label={t("birthDate")}>{account.birthDate ?? "—"}</Field>
        <Field label={to("locale")}>{account.locale ?? "—"}</Field>
        <Field label={to("bodyWeight")}>{account.bodyWeightKg !== null ? `${account.bodyWeightKg} kg` : "—"}</Field>
        <Field label={to("height")}>{account.heightCm !== null ? `${account.heightCm} cm` : "—"}</Field>
        <Field label={ts("tier")} testId="client-account-tier">
          {entitlement?.tier ?? "free"}
          {entitlement?.source ? ` · ${entitlement.source}` : ""}
        </Field>
        <Field label={ts("expires")}>{instantLabel(lang, entitlement?.expiresAtISO ?? null, timezone)}</Field>
        {account.disabled ? (
          <Field label={t("authStatus")}>
            <Badge variant="destructive">{t("disabled")}</Badge>
          </Field>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ClientBillingCard({ overview, auditHref }: { overview: ClientAdminOverview; auditHref?: string }) {
  const t = useTranslations("admin.clientDetail.overview.billing");
  const tb = useTranslations("admin.coachDetail.overview.billing");
  const tAudit = useTranslations("admin.coachDetail.overview");
  const tp = useTranslations("payments");
  const lang = langOf(useLocale());
  const b = overview.billing;
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
  const methodLabel: Record<string, string> = {
    cash: tp("method.cash"),
    transfer: tp("method.transfer"),
    mercadopago: tp("method.mercadopago"),
    card: tp("method.card"),
    other: tp("method.other"),
  };
  return (
    <Card data-testid="client-billing-card">
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
      <CardContent className="space-y-4">
        {!b ? (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        ) : (
          <>
            <div className="grid gap-x-8 sm:grid-cols-2">
              <Field label={tp("status.title")} testId="client-billing-state">
                <Badge variant={billingBadgeVariant(b.state)}>{stateLabel[b.state]}</Badge>
              </Field>
              <Field label={tp("plan")}>
                {b.planName ? `${b.planName} · ${money(lang, b.amount, b.currency)}` : tp("status.none")}
              </Field>
              <Field label={tp("nextDue")}>{civilLabel(lang, b.nextDueCivil)}</Field>
              {b.classesRemaining !== null ? (
                <Field label={t("classes")}>{tp("classesLeft", { count: b.classesRemaining })}</Field>
              ) : null}
              <Field label={tp("lastPayment")}>{civilLabel(lang, b.lastPaymentCivil)}</Field>
              <Field label={t("paidTotal")} testId="client-billing-total">
                {b.paidTotal.length === 0 ? "—" : b.paidTotal.map((x) => money(lang, x.amount, x.currency)).join(" · ")}
              </Field>
            </div>
            {b.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tb("recentEmpty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <Table data-testid="client-billing-payments">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tb("recentCol.date")}</TableHead>
                      <TableHead>{tb("recentCol.amount")}</TableHead>
                      <TableHead>{tb("recentCol.method")}</TableHead>
                      <TableHead>{tb("recentCol.covers")}</TableHead>
                      <TableHead>{tb("recentCol.plan")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {b.payments.map((p) => (
                      <TableRow key={p.id} data-testid={`client-payment-${p.id}`} className={p.voidedAt ? "opacity-60" : undefined}>
                        <TableCell className="whitespace-nowrap text-xs">{civilLabel(lang, p.paidCivil)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span className={p.voidedAt ? "line-through" : undefined}>{money(lang, p.amount, p.currency)}</span>{" "}
                          {p.voidedAt ? <Badge variant="secondary">{tb("voided")}</Badge> : null}
                        </TableCell>
                        <TableCell className="text-xs">{methodLabel[p.method] ?? p.method}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{coversText(p.covers)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.planName ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function ClientRelationshipCards({ overview }: { overview: ClientAdminOverview }) {
  const t = useTranslations("admin.clientDetail.overview");
  const lang = langOf(useLocale());
  const { goals, chat, corvo, notesCount, timezone } = overview;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card size="sm" data-testid="client-goals-card">
        <CardHeader>
          <CardTitle>{t("goals.title")}</CardTitle>
          {goals ? (
            <CardDescription data-testid="client-goals-summary">
              {t("goals.summary", { active: goals.active, completed: goals.completed, archived: goals.archived })}
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          {goals && goals.activeTitles.length > 0 ? (
            <ul className="list-disc space-y-1 pl-4 text-sm">
              {goals.activeTitles.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("goals.empty")}</p>
          )}
          {goals && goals.clientOwned > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">{t("goals.clientOwned", { count: goals.clientOwned })}</p>
          ) : null}
          {notesCount !== null ? (
            <p className="mt-1 text-xs text-muted-foreground">{t("notes", { count: notesCount })}</p>
          ) : null}
        </CardContent>
      </Card>
      <Card size="sm" data-testid="client-chat-card">
        <CardHeader>
          <CardTitle>{t("chat.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {chat ? (
            <>
              <Field label={t("chat.last")}>{instantLabel(lang, chat.lastMessageAtISO, timezone, true)}</Field>
              <Field label={t("chat.lastFrom")} testId="client-chat-last-from">
                {chat.lastSenderIsClient === null ? "—" : chat.lastSenderIsClient ? t("chat.client") : t("chat.coach")}
              </Field>
              <Field label={t("chat.unreadByCoach")} testId="client-chat-unread-coach">
                {chat.unreadByCoach}
              </Field>
              <Field label={t("chat.unreadByClient")}>{chat.unreadByClient}</Field>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("chat.none")}</p>
          )}
        </CardContent>
      </Card>
      <Card size="sm" data-testid="client-corvo-card">
        <CardHeader>
          <CardTitle>Corvo</CardTitle>
        </CardHeader>
        <CardContent>
          {corvo ? (
            <>
              <Field label={t("corvo.turns")} testId="client-corvo-turns">
                {corvo.turnsTotal}
              </Field>
              <Field label={t("corvo.last")}>{instantLabel(lang, corvo.lastMessageAtISO, timezone)}</Field>
              <Field label={t("corvo.consent")}>{instantLabel(lang, corvo.consentAtISO, timezone)}</Field>
              <Field label={t("corvo.photosConsent")}>{instantLabel(lang, corvo.photosConsentAtISO, timezone)}</Field>
              <Field label={t("corvo.reports")} testId="client-corvo-reports">
                {corvo.reports}
              </Field>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("corvo.none")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
