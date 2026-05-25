import { getTranslations } from "next-intl/server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import type { ClientGoalRow } from "@/lib/gc-fitness/client-goal-actions";

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
      return {
        id: doc.id,
        name: localizedName(nameValue, t("untitledWorkout")),
        recurrence: recurrenceLabel(data.recurrence as Record<string, unknown> | undefined, t),
        scheduledFor: typeof data.scheduledFor === "string" ? data.scheduledFor : "",
      };
    })
    .filter((row): row is { id: string; name: string; recurrence: string; scheduledFor: string } => row !== null)
    .slice(0, 30);

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
              {workouts.map((row) => (
                <li key={row.id} className="rounded-md bg-muted px-3 py-1.5 text-sm">
                  <p className="font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.recurrence}
                    {row.scheduledFor ? ` · ${row.scheduledFor}` : ""}
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
  if (recurrence.kind === "weekly") return t("weekly");
  if (recurrence.kind === "weekly_days") return t("weeklyDays");
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
    const weekdays = Array.isArray(habit.scheduleWeekdays)
      ? (habit.scheduleWeekdays as number[]).length
      : 0;
    return t("weeklyCount", { count: weekdays || 1 });
  }
  if (cadence === "monthly") {
    const monthDays = Array.isArray(habit.scheduleMonthDays)
      ? (habit.scheduleMonthDays as number[]).length
      : typeof habit.scheduleDayOfMonth === "number"
        ? 1
        : 0;
    return t("monthlyCount", { count: monthDays || 1 });
  }
  return t("daily");
}
