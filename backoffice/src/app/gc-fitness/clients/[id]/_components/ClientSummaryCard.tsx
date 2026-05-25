import { getTranslations } from "next-intl/server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import type { ClientGoalRow } from "@/lib/gc-fitness/client-goal-actions";
import { Badge } from "@/components/ui/badge";
const WEEKDAY_LABELS_WORKOUT: Record<number, string> = {
  0: "Dom",
  1: "Lun",
  2: "Mar",
  3: "Mié",
  4: "Jue",
  5: "Vie",
  6: "Sáb",
};

export async function ClientSummaryCard({
  clientId,
  goals,
}: {
  clientId: string;
  goals: ClientGoalRow[];
}) {
  const t = await getTranslations("clients.detail.summary");
  const db = gcFitnessFirestore();

  // Fail-soft on summary data: this card must never break the whole
  // client detail route. Some projects can be temporarily missing the
  // compound index required by strict status+date filters.
  const [assignmentsSnap, habitsSnap] = await Promise.all([
    db
      .collection(FirestoreCollections.workoutAssignments)
      .where("clientId", "==", clientId)
      .orderBy("scheduledFor", "asc")
      .limit(80)
      .get()
      .catch(() => ({ docs: [] as Array<{ id: string; data: () => Record<string, unknown> }> })),
    db
      .collection(FirestoreCollections.habits)
      .where("clientId", "==", clientId)
      .where("deleted", "==", false)
      .limit(40)
      .get()
      .catch(() => ({ docs: [] as Array<{ id: string; data: () => Record<string, unknown> }> })),
  ]);

  const workouts = assignmentsSnap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      if (data.status !== "scheduled") return null;
      const nameValue = (data.templateSnapshot as { name?: unknown } | undefined)?.name;
      const recurrence = recurrenceLabel(data.recurrence as Record<string, unknown> | undefined, t);
      return {
        id: doc.id,
        name: localizedName(nameValue, t("untitledWorkout")),
        recurrence,
        scheduledFor: typeof data.scheduledFor === "string" ? data.scheduledFor : "",
      };
    })
    .filter((row): row is { id: string; name: string; recurrence: string; scheduledFor: string } => row !== null)
    .slice(0, 30);
  const workoutsGrouped = groupWorkouts(workouts);

  const habits = habitsSnap.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      name: localizedName(data.name, t("untitledHabit")),
      cadence: habitCadenceLabel(data, t),
    };
  });

  return (
    <section className="rounded-md border bg-card p-3.5 sm:p-4">
      <h2 className="mb-1 font-medium">{t("title")}</h2>
      <p className="mb-3 text-sm text-muted-foreground">{t("subtitle")}</p>

      <div className="space-y-3.5">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("workouts")}
          </p>
          {workouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noWorkouts")}</p>
          ) : (
            <ul className="space-y-1.5">
              {workoutsGrouped.map((row) => (
                <li key={row.key} className="rounded-md bg-muted px-3 py-1.5 text-sm">
                  <div className="mb-0.5 flex items-center gap-2">
                    <p className="font-medium">{row.name}</p>
                    <Badge variant="secondary">{row.recurrence}</Badge>
                    {row.count > 1 ? <Badge variant="outline">x{row.count}</Badge> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {row.nextDate ? `${t("nextDate")} ${row.nextDate}` : t("noDate")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("habits")}
          </p>
          {habits.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noHabits")}</p>
          ) : (
            <ul className="space-y-1.5">
              {habits.map((row) => (
                <li key={row.id} className="rounded-md bg-muted px-3 py-1.5 text-sm">
                  <p className="font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">{row.cadence}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("goals")}
          </p>
          {goals.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noGoals")}</p>
          ) : (
            <ul className="space-y-1.5">
              {goals.slice(0, 8).map((goal) => (
                <li key={goal.id} className="rounded-md bg-muted px-3 py-1.5 text-sm">
                  <p className="font-medium">{goal.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {goal.horizon} · {goal.status}
                    {goal.targetDate ? ` · ${goal.targetDate}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function localizedName(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") {
    const localized = value as { en?: unknown; es?: unknown };
    if (typeof localized.en === "string" && localized.en.trim()) return localized.en;
    if (typeof localized.es === "string" && localized.es.trim()) return localized.es;
  }
  return fallback;
}

function recurrenceLabel(
  recurrence: Record<string, unknown> | undefined,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  if (!recurrence || typeof recurrence.kind !== "string") return t("once");
  if (recurrence.kind === "weekly") {
    const weekday = Number(recurrence.weekday);
    const dayLabel = Number.isFinite(weekday) ? WEEKDAY_LABELS_WORKOUT[weekday] : null;
    return dayLabel ? `${t("weekly")} · ${dayLabel}` : t("weekly");
  }
  if (recurrence.kind === "weekly_days") {
    const days = Array.isArray(recurrence.weekdays)
      ? (recurrence.weekdays as number[])
          .map((d) => WEEKDAY_LABELS_WORKOUT[d])
          .filter((v): v is string => Boolean(v))
      : [];
    return days.length > 0 ? `${t("weeklyDays")} · ${days.join(", ")}` : t("weeklyDays");
  }
  if (recurrence.kind === "every_n_days") return t("everyNDays", { everyN: Number(recurrence.everyN ?? 1) });
  return t("custom");
}

function habitCadenceLabel(
  habit: Record<string, unknown>,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  if (habit.scheduleType === "one-time") return t("once");
  const cadence = typeof habit.scheduleCadence === "string" ? habit.scheduleCadence : "daily";
  if (cadence === "weekly") {
    const weekdays = Array.isArray(habit.scheduleWeekdays) ? (habit.scheduleWeekdays as number[]) : [];
    const mapped = weekdays
      .map((d) => WEEKDAY_LABELS_WORKOUT[d === 7 ? 0 : d])
      .filter((v): v is string => Boolean(v));
    return mapped.length > 0 ? `${t("weekly")} · ${mapped.join(", ")}` : t("weeklyCount", { count: 1 });
  }
  if (cadence === "monthly") {
    const monthDays = Array.isArray(habit.scheduleMonthDays)
      ? (habit.scheduleMonthDays as number[])
      : typeof habit.scheduleDayOfMonth === "number"
        ? [habit.scheduleDayOfMonth as number]
        : [];
    return monthDays.length > 0 ? `${t("monthlyCount", { count: monthDays.length })} · ${monthDays.join(", ")}` : t("monthlyCount", { count: 1 });
  }
  return t("daily");
}

function groupWorkouts(
  rows: Array<{ id: string; name: string; recurrence: string; scheduledFor: string }>,
): Array<{ key: string; name: string; recurrence: string; count: number; nextDate: string }> {
  const map = new Map<string, { key: string; name: string; recurrence: string; count: number; nextDate: string }>();
  for (const row of rows) {
    const key = `${row.name}__${row.recurrence}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { key, name: row.name, recurrence: row.recurrence, count: 1, nextDate: row.scheduledFor });
      continue;
    }
    existing.count += 1;
    if (!existing.nextDate || (row.scheduledFor && row.scheduledFor < existing.nextDate)) {
      existing.nextDate = row.scheduledFor;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}
