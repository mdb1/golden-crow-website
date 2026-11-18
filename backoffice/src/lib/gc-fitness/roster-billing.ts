// roster-billing.ts — golden-crow-website#535: a client's billing as the coach
// surfaces show it (roster card / list, Inicio «Cobros», the profile's status
// strip). Pure; the one place that turns a `client_billing` doc into a state.

import { status as billingStatus } from "./billing";
import type { ClientBillingView } from "./payments-model";

/** What the coach surfaces show about a client's payments. */
export interface RosterBilling {
  state: "overdue" | "due_soon" | "up_to_date";
  /** Days overdue / until due; for class packs, classes left. */
  days: number;
  classBased: boolean;
  planName: string | null;
  nextDueCivil: string | null;
}

/** null = no plan (or no billing doc). */
export function toRosterBilling(
  billing: Pick<
    ClientBillingView,
    "planId" | "plan" | "startCivil" | "nextDueCivil" | "classesRemaining" | "reminderDaysBefore"
  > | null | undefined,
  todayCivil: string,
): RosterBilling | null {
  if (!billing) return null;
  const s = billingStatus(
    {
      planId: billing.planId,
      plan: billing.plan,
      startCivil: billing.startCivil,
      nextDueCivil: billing.nextDueCivil,
      classesRemaining: billing.classesRemaining,
      reminderDaysBefore: billing.reminderDaysBefore,
    },
    todayCivil,
  );
  if (s.state === "none") return null;
  return {
    state: s.state,
    days: s.days,
    classBased: billing.plan?.kind === "class_pack" || billing.plan?.kind === "per_class",
    planName: billing.plan?.name ?? null,
    nextDueCivil: billing.nextDueCivil,
  };
}
