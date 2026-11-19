// ClientStatusStrip.tsx — golden-crow-website#535: the four facts a coach opens
// a client's profile to check, right under the header. Before, the first screen
// was nickname / birthday / height / app build, and payments were the 5th section.
//
//   · Última actividad — what and when (same source as the roster).
//   · Hábitos (7 d)     — compliance + the trend vs the week before.
//   · Entrenamientos    — workouts missed in the last 7 days.
//   · Pago              — the billing chip + «vence en 3 días».
//
// Cost: TWO point reads — `client_stats/{id}` (the roster's cache, kept fresh by
// the gc-fitness `clientStatsDirty*` triggers + its 2 h max age) and the billing
// doc. When the roster never computed this client yet, the stats tiles show an
// em dash and say so, instead of running the roster's 7-query fan-out here.

import { getTranslations } from "next-intl/server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import type { ClientRosterRow } from "@/lib/gc-fitness/client-roster";
import { decodeClientStats } from "@/lib/gc-fitness/client-stats";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { pickLastActivityKind } from "@/lib/gc-fitness/last-activity-kind";
import { getClientBilling } from "@/lib/gc-fitness/payments-actions";
import { toRosterBilling } from "@/lib/gc-fitness/roster-billing";
import { cn } from "@/lib/utils";

import { HabitTrendBadge, RosterLastActivity, RosterPayment } from "../../_components/RosterBits";
import { habitCompliancePct, habitTrend } from "../../_components/roster-metrics";

interface Props {
  clientId: string;
  coachId: string;
  /** Today in the COACH zone (billing due dates are coach civil days, like /payments). */
  billingTodayCivil: string;
}

export async function ClientStatusStrip({ clientId, coachId, billingTodayCivil }: Props) {
  const t = await getTranslations("clients.detail.statusStrip");
  const [statsSnap, billing] = await Promise.all([
    gcFitnessFirestore()
      .collection(FirestoreCollections.clientStats)
      .doc(clientId)
      .get()
      .catch(() => null),
    getClientBilling(clientId).catch(() => null),
  ]);
  const decoded = statsSnap?.exists ? decodeClientStats(statsSnap.data()) : null;
  // Another coach's cached numbers are not this coach's to show (#1504).
  const stats = decoded && decoded.key.coachId === coachId ? decoded.values : null;

  const asDate = (ms: number | null) => (ms === null ? null : new Date(ms));
  const lastMs = stats
    ? Math.max(stats.lastWorkoutAtMs ?? 0, stats.lastHabitAtMs ?? 0, stats.lastPhotoAtMs ?? 0)
    : 0;
  // The shared view helpers read a roster row; build the slice they need.
  const row = {
    lastActivityAt: lastMs > 0 ? new Date(lastMs).toISOString() : null,
    lastActivityKind: stats
      ? pickLastActivityKind({
          workout: asDate(stats.lastWorkoutAtMs),
          habit: asDate(stats.lastHabitAtMs),
          photo: asDate(stats.lastPhotoAtMs),
        })
      : null,
    thisWeekComplianceRatio: stats?.thisWeekComplianceRatio ?? 0,
    prevWeekComplianceRatio: stats?.prevWeekComplianceRatio ?? null,
    habitsScheduledThisWeek: stats?.habitsScheduledThisWeek ?? 0,
    billing: toRosterBilling(billing, billingTodayCivil),
  } as ClientRosterRow;

  const missed = stats?.missedForAttention ?? null;

  return (
    <div
      className="grid grid-cols-2 gap-3 rounded-[1.25rem] border border-border bg-card p-4 lg:grid-cols-4"
      data-testid="client-status-strip"
    >
      <Tile label={t("lastActivity")}>
        {stats ? (
          <span className="text-sm font-medium">
            <RosterLastActivity row={row} />
          </span>
        ) : (
          <Pending text={t("notComputed")} />
        )}
      </Tile>
      <Tile label={t("habits")}>
        {stats && row.habitsScheduledThisWeek > 0 ? (
          <span className="inline-flex items-center gap-2">
            <span className="text-lg font-semibold tabular-nums">{habitCompliancePct(row)}%</span>
            <HabitTrendBadge trend={habitTrend(row)} />
          </span>
        ) : stats ? (
          <span className="text-sm text-muted-foreground">{t("noHabitsScheduled")}</span>
        ) : (
          <Pending text={t("notComputed")} />
        )}
      </Tile>
      <Tile label={t("missedWorkouts")}>
        {missed !== null ? (
          <span
            className={cn("text-lg font-semibold tabular-nums", missed > 0 && "text-status-overdue")}
            data-testid="client-status-missed"
          >
            {missed}
          </span>
        ) : (
          <Pending text={t("notComputed")} />
        )}
      </Tile>
      <Tile label={t("payment")}>
        <a href="#pagos" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <RosterPayment row={row} compact />
        </a>
      </Tile>
    </div>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function Pending({ text }: { text: string }) {
  return (
    <span className="text-sm text-muted-foreground" title={text}>
      —<span className="sr-only"> {text}</span>
    </span>
  );
}
