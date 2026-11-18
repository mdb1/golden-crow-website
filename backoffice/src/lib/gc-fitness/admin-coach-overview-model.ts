// admin-coach-overview-model.ts — golden-crow-website#534: everything the admin coach
// detail (/gc-fitness/admin/coaches/[uid]) shows beyond the original counts — billing
// (plans, payments, who is up to date), the per-client table (last activity, payment
// status, compliance, nutrition, Corvo), nutrition, habits, challenges, checklist,
// invites, Corvo, social and the coach's own activity / app version.
//
// PURE: no Firestore, no "use server" (sync exports here are fine — the reader is
// `admin-coach-overview.ts`, a server-only module). Everything that crosses to a client
// component is plain serializable data (ms numbers / ISO strings / civil dates).
//
// Billing semantics are NOT re-implemented here: state comes from the `billing.ts` twin
// (`status`, `effectiveAmount`) and decoding from `payments-model.ts`, so the admin says
// «Vencido» exactly when the coach's own screens and phones do.

import { effectiveAmount, status as billingStatus, type BillingState } from "./billing";
import { addMonths } from "./billing";
import {
  sumByCurrency,
  type ClientBillingView,
  type ClientPaymentView,
  type PaymentPlan,
} from "./payments-model";

// ── Per-client table ────────────────────────────────────────────────────────────

export type LastActivityKind = "workout" | "habit" | "photo" | "corvo" | "app_open";

export interface CoachClientOverviewRow {
  uid: string;
  displayName: string;
  email: string;
  deleted: boolean;
  /** Auth account creation (ms) — the «alta». */
  signupAtMs: number | null;
  /** Newest of every activity signal (ms) and which one it was. */
  lastActivityAtMs: number | null;
  lastActivityKind: LastActivityKind | null;
  lastWorkoutAtMs: number | null;
  /** This-week habit/workout compliance from the roster cache, 0..1 (null = no cache). */
  complianceRatio: number | null;
  workoutsCompletedThisMonth: number | null;
  workoutsScheduledThisMonth: number | null;
  // Billing (null planName = no plan).
  billingState: BillingState;
  /** Days until due (due_soon / up_to_date), days overdue (overdue) or classes left (class plans). */
  billingDays: number;
  planName: string | null;
  planKind: string | null;
  amount: number | null;
  currency: string | null;
  lastPaymentCivil: string | null;
  lastPaymentAmount: number | null;
  nextDueCivil: string | null;
  classesRemaining: number | null;
  // Nutrition.
  nutritionPlanName: string | null;
  nutritionPercent7d: number | null;
  // Corvo + subscription.
  corvoTurnsTotal: number;
  corvoLastMessageAtMs: number | null;
  entitlementTier: "premium" | "free";
}

export interface ClientSignals {
  lastWorkoutAtMs?: number | null;
  lastHabitAtMs?: number | null;
  lastPhotoAtMs?: number | null;
  corvoLastMessageAtMs?: number | null;
  /** Auth `lastRefreshTime` — the app refreshed its token, i.e. it was opened. */
  lastAppOpenAtMs?: number | null;
}

/** Newest signal wins; ties resolve in the order below (a workout beats an app open). */
export function pickLastActivity(signals: ClientSignals): {
  atMs: number | null;
  kind: LastActivityKind | null;
} {
  const candidates: Array<[LastActivityKind, number | null | undefined]> = [
    ["workout", signals.lastWorkoutAtMs],
    ["habit", signals.lastHabitAtMs],
    ["photo", signals.lastPhotoAtMs],
    ["corvo", signals.corvoLastMessageAtMs],
    ["app_open", signals.lastAppOpenAtMs],
  ];
  let best: { atMs: number | null; kind: LastActivityKind | null } = { atMs: null, kind: null };
  for (const [kind, ms] of candidates) {
    if (typeof ms !== "number" || !Number.isFinite(ms)) continue;
    if (best.atMs === null || ms > best.atMs) best = { atMs: ms, kind };
  }
  return best;
}

/** Max of two optional instants (users.lastWorkoutAt vs the roster cache). */
export function maxMs(a: number | null | undefined, b: number | null | undefined): number | null {
  const av = typeof a === "number" && Number.isFinite(a) ? a : null;
  const bv = typeof b === "number" && Number.isFinite(b) ? b : null;
  if (av === null) return bv;
  if (bv === null) return av;
  return Math.max(av, bv);
}

/** Billing columns of a client row, through the shared twin. */
export function billingColumns(
  billing: ClientBillingView | null | undefined,
  today: string,
): Pick<
  CoachClientOverviewRow,
  | "billingState"
  | "billingDays"
  | "planName"
  | "planKind"
  | "amount"
  | "currency"
  | "lastPaymentCivil"
  | "lastPaymentAmount"
  | "nextDueCivil"
  | "classesRemaining"
> {
  const st = billingStatus(billing ?? null, today);
  return {
    billingState: st.state,
    billingDays: st.days,
    planName: billing?.plan?.name ?? null,
    planKind: billing?.plan?.kind ?? null,
    amount: effectiveAmount(billing ?? null),
    currency: billing?.plan?.currency ?? null,
    lastPaymentCivil: billing?.lastPaymentCivil ?? null,
    lastPaymentAmount: billing?.lastPaymentAmount ?? null,
    nextDueCivil: billing?.nextDueCivil ?? null,
    classesRemaining: billing?.classesRemaining ?? null,
  };
}

export type ClientSortKey =
  | "name"
  | "lastActivity"
  | "billing"
  | "nextDue"
  | "lastPayment"
  | "compliance"
  | "signup"
  | "corvo";

export type SortDir = "asc" | "desc";

/** Billing urgency: overdue first, then due soon, up to date, and no plan last. */
const BILLING_RANK: Record<BillingState, number> = {
  overdue: 0,
  due_soon: 1,
  up_to_date: 2,
  none: 3,
};

function nameOf(row: CoachClientOverviewRow): string {
  return (row.displayName || row.email || row.uid).toLocaleLowerCase();
}

/** Missing values always sort LAST, whatever the direction (an empty cell is never "first"). */
function compareNullable<T extends number | string>(
  a: T | null,
  b: T | null,
  dir: SortDir,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (a === b) return 0;
  const base = a < b ? -1 : 1;
  return dir === "asc" ? base : -base;
}

export function sortClientRows(
  rows: readonly CoachClientOverviewRow[],
  key: ClientSortKey,
  dir: SortDir,
): CoachClientOverviewRow[] {
  const cmp = (a: CoachClientOverviewRow, b: CoachClientOverviewRow): number => {
    switch (key) {
      case "name":
        return compareNullable(nameOf(a), nameOf(b), dir);
      case "lastActivity":
        return compareNullable(a.lastActivityAtMs, b.lastActivityAtMs, dir);
      case "billing": {
        // asc = most urgent first; within a state, the most days overdue / fewest days left first.
        const r = BILLING_RANK[a.billingState] - BILLING_RANK[b.billingState];
        if (r !== 0) return dir === "asc" ? r : -r;
        const d =
          a.billingState === "overdue" ? b.billingDays - a.billingDays : a.billingDays - b.billingDays;
        return dir === "asc" ? d : -d;
      }
      case "nextDue":
        return compareNullable(a.nextDueCivil, b.nextDueCivil, dir);
      case "lastPayment":
        return compareNullable(a.lastPaymentCivil, b.lastPaymentCivil, dir);
      case "compliance":
        return compareNullable(a.complianceRatio, b.complianceRatio, dir);
      case "signup":
        return compareNullable(a.signupAtMs, b.signupAtMs, dir);
      case "corvo":
        return compareNullable(a.corvoTurnsTotal, b.corvoTurnsTotal, dir);
      default:
        return 0;
    }
  };
  return [...rows].sort((a, b) => cmp(a, b) || nameOf(a).localeCompare(nameOf(b)) || a.uid.localeCompare(b.uid));
}

/** The direction a column starts in when first clicked (dates: newest first). */
export function defaultSortDir(key: ClientSortKey): SortDir {
  return key === "name" || key === "billing" || key === "nextDue" ? "asc" : "desc";
}

/** Whole days between an instant and now (floor), or null. */
export function daysAgo(ms: number | null, nowMs: number): number | null {
  if (ms === null) return null;
  return Math.max(0, Math.floor((nowMs - ms) / 86_400_000));
}

// ── Billing summary ─────────────────────────────────────────────────────────────

export interface PlanUsageRow {
  id: string;
  name: string;
  kind: string;
  amount: number;
  currency: string;
  periodMonths: number | null;
  classCount: number | null;
  archived: boolean;
  /** Current (non-deleted, linked) clients on this plan. */
  clients: number;
}

export interface MonthTotal {
  month: string; // YYYY-MM
  currency: string;
  amount: number;
  payments: number;
}

export interface CoachBillingSummary {
  plans: PlanUsageRow[];
  stateCounts: Record<BillingState, number>;
  /** Monthly-equivalent of every current client's plan (amount / months), per currency. */
  expectedMonthly: Array<{ currency: string; amount: number }>;
  /** The last `months` months (oldest first), zero-filled, one row per month × currency. */
  monthly: MonthTotal[];
  /** The currency with most collected in the window (what the chart plots). */
  chartCurrency: string | null;
  collectedInWindow: Array<{ currency: string; amount: number }>;
  collectedThisMonth: Array<{ currency: string; amount: number }>;
  /** Newest first, voided included (flagged). */
  recentPayments: ClientPaymentView[];
  voidedCount: number;
  /** Payments from clients that are no longer with this coach (still the coach's money). */
  paymentsFromFormerClients: number;
}

/** `YYYY-MM` keys of the last `n` months ending at `todayCivil`'s month, oldest first. */
export function lastMonths(todayCivil: string, n: number): string[] {
  const first = `${todayCivil.slice(0, 7)}-01`;
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) out.push(addMonths(first, -i).slice(0, 7));
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function summarizeCoachBilling(input: {
  plans: PaymentPlan[];
  billings: ClientBillingView[];
  payments: ClientPaymentView[];
  /** uids of the coach's CURRENT (non-deleted) clients. */
  currentClientIds: ReadonlySet<string>;
  today: string;
  months?: number;
  recentLimit?: number;
}): CoachBillingSummary {
  const months = lastMonths(input.today, input.months ?? 12);
  const currentBillings = input.billings.filter((b) => input.currentClientIds.has(b.clientId));

  const perPlan = new Map<string, number>();
  for (const b of currentBillings) {
    if (b.planId) perPlan.set(b.planId, (perPlan.get(b.planId) ?? 0) + 1);
  }
  const plans: PlanUsageRow[] = input.plans
    .map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      amount: p.amount,
      currency: p.currency,
      periodMonths: p.periodMonths,
      classCount: p.classCount,
      archived: p.archived,
      clients: perPlan.get(p.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        Number(a.archived) - Number(b.archived) ||
        b.clients - a.clients ||
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );

  const stateCounts: Record<BillingState, number> = { none: 0, up_to_date: 0, due_soon: 0, overdue: 0 };
  const billingByClient = new Map(currentBillings.map((b) => [b.clientId, b]));
  for (const uid of input.currentClientIds) {
    stateCounts[billingStatus(billingByClient.get(uid) ?? null, input.today).state] += 1;
  }

  const expected = new Map<string, number>();
  for (const b of currentBillings) {
    const amount = effectiveAmount(b);
    if (amount == null || !b.plan) continue;
    const period =
      b.plan.kind === "monthly" ? 1 : b.plan.kind === "months_pack" || b.plan.kind === "custom" ? b.plan.periodMonths : null;
    if (!period) continue;
    expected.set(b.plan.currency, round2((expected.get(b.plan.currency) ?? 0) + amount / period));
  }

  const window = new Set(months);
  const live = input.payments.filter((p) => !p.voidedAt);
  const inWindow = live.filter((p) => window.has(p.paidCivil.slice(0, 7)));
  const currencies = [...new Set(inWindow.map((p) => p.currency))].sort();
  const totals = new Map<string, { amount: number; payments: number }>();
  for (const p of inWindow) {
    const k = `${p.paidCivil.slice(0, 7)}|${p.currency}`;
    const cur = totals.get(k) ?? { amount: 0, payments: 0 };
    totals.set(k, { amount: round2(cur.amount + p.amount), payments: cur.payments + 1 });
  }
  const monthly: MonthTotal[] = [];
  for (const month of months) {
    for (const currency of currencies) {
      const t = totals.get(`${month}|${currency}`);
      monthly.push({ month, currency, amount: t?.amount ?? 0, payments: t?.payments ?? 0 });
    }
  }
  const collectedInWindow = sumByCurrency(inWindow);
  const chartCurrency =
    [...collectedInWindow].sort((a, b) => b.amount - a.amount)[0]?.currency ?? null;
  const thisMonth = input.today.slice(0, 7);

  return {
    plans,
    stateCounts,
    expectedMonthly: [...expected.entries()]
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
    monthly,
    chartCurrency,
    collectedInWindow,
    collectedThisMonth: sumByCurrency(live.filter((p) => p.paidCivil.startsWith(thisMonth))),
    recentPayments: input.payments.slice(0, input.recentLimit ?? 25),
    voidedCount: input.payments.filter((p) => p.voidedAt).length,
    paymentsFromFormerClients: inWindow.filter((p) => !input.currentClientIds.has(p.clientId)).length,
  };
}

// ── Other sections ──────────────────────────────────────────────────────────────

export interface CoachChecklistSummary {
  open: number;
  overdue: number;
  done: number;
  /** Next open items by due date (oldest due first). */
  upcoming: Array<{ id: string; title: string; dueAtISO: string | null; overdue: boolean }>;
}

export function summarizeChecklist(
  items: Array<{ id: string; title: string; completed: boolean; dueAtMs: number | null }>,
  nowMs: number,
  limit = 5,
): CoachChecklistSummary {
  const open = items.filter((i) => !i.completed);
  const isOverdue = (i: { dueAtMs: number | null }) => i.dueAtMs !== null && i.dueAtMs < nowMs;
  return {
    open: open.length,
    overdue: open.filter(isOverdue).length,
    done: items.length - open.length,
    upcoming: [...open]
      .sort((a, b) => (a.dueAtMs ?? Number.MAX_SAFE_INTEGER) - (b.dueAtMs ?? Number.MAX_SAFE_INTEGER))
      .slice(0, limit)
      .map((i) => ({
        id: i.id,
        title: i.title,
        dueAtISO: i.dueAtMs === null ? null : new Date(i.dueAtMs).toISOString(),
        overdue: isOverdue(i),
      })),
  };
}

export interface CoachNutritionSummary {
  templates: number;
  /** Phases authored by this coach (any client, incl. ended). */
  plans: number;
  /** Current clients with a phase in force today. */
  clientsWithActivePlan: number;
  /** Current clients whose only phases have lapsed — nobody loaded the next one. */
  clientsWithLapsedPlan: number;
  /** Mean 7-day adherence over clients that had something asked (null = nobody). */
  avgPercent7d: number | null;
}

export function summarizeNutrition(input: {
  templates: number;
  plans: number;
  summaries: Array<{ hasActivePlan: boolean; neverHadPlan: boolean; percent7d: number | null }>;
}): CoachNutritionSummary {
  const pcts = input.summaries.map((s) => s.percent7d).filter((p): p is number => p !== null);
  return {
    templates: input.templates,
    plans: input.plans,
    clientsWithActivePlan: input.summaries.filter((s) => s.hasActivePlan).length,
    clientsWithLapsedPlan: input.summaries.filter((s) => !s.hasActivePlan && !s.neverHadPlan).length,
    avgPercent7d: pcts.length === 0 ? null : Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length),
  };
}

export interface CoachCorvoSummary {
  /** Current clients that ever talked to Corvo. */
  clientsUsing: number;
  /** Of those, how many in the last 7 days. */
  activeLast7d: number;
  turnsTotal: number;
  /** Current clients who accepted the Corvo consent. */
  consented: number;
  lastMessageAtMs: number | null;
}

export function summarizeCorvo(
  threads: Array<{ turnsTotal: number; lastMessageAtMs: number | null; consented: boolean }>,
  nowMs: number,
): CoachCorvoSummary {
  const using = threads.filter((t) => t.turnsTotal > 0 || t.lastMessageAtMs !== null);
  return {
    clientsUsing: using.length,
    activeLast7d: using.filter((t) => t.lastMessageAtMs !== null && nowMs - t.lastMessageAtMs <= 7 * 86_400_000)
      .length,
    turnsTotal: threads.reduce((a, t) => a + t.turnsTotal, 0),
    consented: threads.filter((t) => t.consented).length,
    lastMessageAtMs: threads.reduce<number | null>((acc, t) => maxMs(acc, t.lastMessageAtMs), null),
  };
}

export interface PendingInviteRow {
  email: string;
  displayName: string;
  /** `user_mirror.inviteEmailStatus` — sent / failed / skipped, null = never attempted. */
  inviteStatus: string | null;
  inviteSentAtISO: string | null;
  lastAttemptAtISO: string | null;
  createdAtISO: string | null;
}

/** Engagement buckets of the current clients, by last activity. */
export function activityBuckets(
  rows: ReadonlyArray<Pick<CoachClientOverviewRow, "lastActivityAtMs" | "deleted">>,
  nowMs: number,
): { last7d: number; last30d: number; inactive30d: number; never: number } {
  const out = { last7d: 0, last30d: 0, inactive30d: 0, never: 0 };
  for (const r of rows) {
    if (r.deleted) continue;
    const d = daysAgo(r.lastActivityAtMs, nowMs);
    if (d === null) out.never += 1;
    else if (d <= 7) out.last7d += 1;
    else if (d <= 30) out.last30d += 1;
    else out.inactive30d += 1;
  }
  return out;
}
