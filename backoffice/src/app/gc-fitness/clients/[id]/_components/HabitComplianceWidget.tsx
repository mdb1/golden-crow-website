import { getTranslations } from "next-intl/server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { civilDateFormat } from "@/lib/gc-fitness/civil-date";
import type { HabitType } from "@/lib/gc-fitness/habit-schema";
import { Progress } from "@/components/ui/progress";

export interface HabitComplianceWidgetProps {
  clientId: string;
  timezone: string;
}

interface HabitRow {
  id: string;
  name: string;
  ratio: number;
  pct: number;
}

function buildLastSevenCivilDates(timezone: string): string[] {
  const dates: string[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const d = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
    dates.push(civilDateFormat(d, timezone));
  }
  return dates;
}

function isHabitScheduledOnDate(habit: Record<string, unknown>, civilDate: string): boolean {
  const startsOn =
    typeof habit.startsOn === "string" && habit.startsOn.length > 0
      ? habit.startsOn
      : null;
  const endsOn =
    typeof habit.endsOn === "string" && habit.endsOn.length > 0
      ? habit.endsOn
      : null;

  if (startsOn && civilDate < startsOn) return false;
  if (endsOn && civilDate > endsOn) return false;

  const scheduleType = habit.scheduleType === "one-time" ? "one-time" : "recurring";
  if (scheduleType === "one-time") {
    return startsOn ? civilDate === startsOn : true;
  }

  const cadence =
    habit.scheduleCadence === "weekly" || habit.scheduleCadence === "monthly"
      ? habit.scheduleCadence
      : "daily";

  if (cadence === "daily") return true;

  const date = new Date(`${civilDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;

  if (cadence === "weekly") {
    const weekdays = Array.isArray(habit.scheduleWeekdays)
      ? (habit.scheduleWeekdays as number[])
      : [];
    const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    const legacyWeekday = weekday === 7 ? 1 : weekday + 1;
    return weekdays.includes(weekday) || weekdays.includes(legacyWeekday);
  }

  const monthDays = Array.isArray(habit.scheduleMonthDays)
    ? (habit.scheduleMonthDays as number[])
    : typeof habit.scheduleDayOfMonth === "number"
      ? [habit.scheduleDayOfMonth]
      : [1];

  return monthDays.includes(date.getUTCDate());
}

export async function HabitComplianceWidget({ clientId, timezone }: HabitComplianceWidgetProps) {
  const t = await getTranslations("clients.detail.habitCompliance");
  const unnamed = t("unnamed");
  const db = gcFitnessFirestore();

  const habitsSnap = await db
    .collection(FirestoreCollections.habits)
    .where("clientId", "==", clientId)
    .where("deleted", "==", false)
    .get();

  const lastSevenDates = buildLastSevenCivilDates(timezone);
  const windowStart = lastSevenDates[0] ?? civilDateFormat(new Date(), timezone);

  const rows: HabitRow[] = await Promise.all(
    habitsSnap.docs.map(async (h) => {
      const habit = h.data() as {
        name?: string | { en?: string; es?: string };
        type?: HabitType;
        targetValue?: number;
      } & Record<string, unknown>;

      const logsSnap = await db
        .collection(FirestoreCollections.habitLogs)
        .where("habitId", "==", h.id)
        .where("civilDate", ">=", windowStart)
        .orderBy("civilDate", "desc")
        .limit(40)
        .get();

      const completedDates = new Set<string>();
      for (const doc of logsSnap.docs) {
        const data = doc.data() as Record<string, unknown>;
        if (data.deleted === true) continue;
        const date = typeof data.civilDate === "string" ? data.civilDate : "";
        if (!date) continue;

        const value = data.value;
        const targetValue = typeof habit.targetValue === "number" ? habit.targetValue : undefined;
        const habitType = (habit.type ?? "binary") as HabitType;

        let completed = false;
        if (habitType === "binary") {
          completed = value === true;
        } else {
          const numeric = typeof value === "number" ? value : Number(value);
          completed = Number.isFinite(numeric) && (
            targetValue === undefined ? numeric > 0 : numeric >= targetValue
          );
        }

        if (completed) completedDates.add(date);
      }

      const scheduledDates = lastSevenDates.filter((d) => isHabitScheduledOnDate(habit, d));
      const denominator = scheduledDates.length;
      const numerator = scheduledDates.filter((d) => completedDates.has(d)).length;
      const ratio = denominator === 0 ? 1 : numerator / denominator;
      const clamped = Math.max(0, Math.min(1, ratio));

      return {
        id: h.id,
        name: localizedName(habit.name, unnamed),
        ratio: clamped,
        pct: Math.round(clamped * 100),
      };
    }),
  );

  rows.sort((a, b) => b.ratio - a.ratio);

  return (
    <section className="rounded-md border bg-card p-4">
      <h2 className="mb-3 font-medium">{t("title")}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 text-sm">
              <span className="flex-1 truncate font-medium">{row.name}</span>
              <Progress value={row.pct} className="h-2 w-24" />
              <span className="w-10 text-right tabular-nums text-muted-foreground">{row.pct}%</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function localizedName(
  value: string | { en?: string; es?: string } | undefined,
  fallback: string,
): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (value && typeof value === "object") return value.en?.trim() || value.es?.trim() || fallback;
  return fallback;
}
