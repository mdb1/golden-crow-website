// admin-client-overview-model.ts — golden-crow-website#534 (PR 2): the pure shaping behind
// the extra sections of the admin client drill-down
// (/gc-fitness/admin/coaches/[uid]/clients/[clientId]): account + app, subscription,
// billing with this coach, goals, Corvo, chat and the activity tiles.
//
// PURE (no Firestore, no "use server"). The reader is `admin-client-overview.ts`.

import { status as billingStatus, effectiveAmount, type BillingState } from "./billing";
import type { ClientBillingView, ClientPaymentView } from "./payments-model";
import { sumByCurrency } from "./payments-model";

export interface ClientGoalCounts {
  active: number;
  completed: number;
  archived: number;
  /** Goals the client wrote themselves (`clientOwned`). */
  clientOwned: number;
  /** Newest active goal titles (max 3). */
  activeTitles: string[];
}

export function summarizeGoals(
  goals: Array<{ title: string; status: string; clientOwned: boolean; updatedAtMs: number | null }>,
): ClientGoalCounts {
  const active = goals
    .filter((g) => g.status !== "completed" && g.status !== "archived")
    .sort((a, b) => (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0));
  return {
    active: active.length,
    completed: goals.filter((g) => g.status === "completed").length,
    archived: goals.filter((g) => g.status === "archived").length,
    clientOwned: goals.filter((g) => g.clientOwned).length,
    activeTitles: active.slice(0, 3).map((g) => g.title),
  };
}

export interface ClientBillingOverview {
  state: BillingState;
  days: number;
  planName: string | null;
  planKind: string | null;
  amount: number | null;
  currency: string | null;
  nextDueCivil: string | null;
  classesRemaining: number | null;
  startCivil: string | null;
  lastPaymentCivil: string | null;
  /** Non-voided total of the loaded payments, per currency. */
  paidTotal: Array<{ currency: string; amount: number }>;
  payments: ClientPaymentView[];
}

export function summarizeClientBilling(
  billing: ClientBillingView | null,
  payments: ClientPaymentView[],
  today: string,
): ClientBillingOverview {
  const st = billingStatus(billing, today);
  return {
    state: st.state,
    days: st.days,
    planName: billing?.plan?.name ?? null,
    planKind: billing?.plan?.kind ?? null,
    amount: effectiveAmount(billing),
    currency: billing?.plan?.currency ?? payments[0]?.currency ?? null,
    nextDueCivil: billing?.nextDueCivil ?? null,
    classesRemaining: billing?.classesRemaining ?? null,
    startCivil: billing?.startCivil ?? null,
    lastPaymentCivil: billing?.lastPaymentCivil ?? null,
    paidTotal: sumByCurrency(payments),
    payments,
  };
}

/** Chat summary for the admin: last message and who owes a reply. */
export function summarizeChat(
  raw: Record<string, unknown> | null,
  coachUid: string,
  clientId: string,
): { lastMessageAtISO: string | null; lastSenderIsClient: boolean | null; unreadByCoach: number; unreadByClient: number } | null {
  if (!raw) return null;
  const unread = raw.unreadCount && typeof raw.unreadCount === "object" ? (raw.unreadCount as Record<string, unknown>) : {};
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  const last = raw.lastMessage && typeof raw.lastMessage === "object" ? (raw.lastMessage as Record<string, unknown>) : null;
  const sender = last && typeof last.senderId === "string" ? last.senderId : null;
  const at = raw.lastMessageAt;
  let iso: string | null = null;
  if (at && typeof (at as { toDate?: () => Date }).toDate === "function") iso = (at as { toDate: () => Date }).toDate().toISOString();
  else if (typeof at === "string") iso = at;
  return {
    lastMessageAtISO: iso,
    lastSenderIsClient: sender === null ? null : sender === clientId,
    unreadByCoach: n(unread[coachUid]),
    unreadByClient: n(unread[clientId]),
  };
}
