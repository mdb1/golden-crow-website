// PendingClientPreload.tsx — P22-04 MIRROR-04 pre-load surface for pending
// clients (user_mirror/{normalizedEmail}). Renders inside the pending-client
// variant of /gc-fitness/clients/[id] (the "mirror:" prefix branch).
//
// Two stacked sections:
//   1. Workouts — list already-pre-loaded assignments + a form to add more.
//   2. Habits — list already-pre-loaded habits + a form to add a binary habit.
//
// On the client's first sign-in, `convertMirrorToCanonical`
// (functions/src/auth/preCreateMirror.ts) batch-updates each
// pendingEmail-tagged doc with clientId=newUid + drops pendingEmail
// atomically with the canonical user doc creation. The iOS first-render
// sees the assignments + habits with zero client-side migration.

import { listPendingAssignments } from "@/lib/gc-fitness/workout-assignment-actions";
import { listHabitTemplates, listPendingHabits } from "@/lib/gc-fitness/habit-actions";
import { listWorkoutTemplates } from "@/lib/gc-fitness/workout-template-actions";
import { PendingWorkoutAssignForm } from "./PendingWorkoutAssignForm";
import { PendingHabitPreloadForm } from "./PendingHabitPreloadForm";
import {
  removePendingHabit as removePendingHabitFor,
  removePendingWorkout as removePendingWorkoutFor,
  submitHabit as submitHabitFor,
  submitWorkoutAssignment as submitWorkoutAssignmentFor,
} from "./pending-client-preload-actions";

const WEEKDAY_LABELS_WORKOUT: Record<number, string> = {
  0: "Dom",
  1: "Lun",
  2: "Mar",
  3: "Mié",
  4: "Jue",
  5: "Vie",
  6: "Sáb",
};

const WEEKDAY_LABELS_HABIT: Record<number, string> = {
  1: "Lun",
  2: "Mar",
  3: "Mié",
  4: "Jue",
  5: "Vie",
  6: "Sáb",
  7: "Dom",
};

export async function PendingClientPreload({
  normalizedEmail,
}: {
  normalizedEmail: string;
}) {
  const [{ templates: workoutTemplates }, pendingWorkouts, pendingHabits, habitTemplates] = await Promise.all([
    listWorkoutTemplates(),
    listPendingAssignments(normalizedEmail),
    listPendingHabits(normalizedEmail),
    listHabitTemplates(),
  ]);

  // #382 — named exports bound to this email, not inline closures: inline
  // closures are numbered by position and an old tab could hit another one.
  const submitWorkoutAssignment = submitWorkoutAssignmentFor.bind(null, normalizedEmail);
  const submitHabit = submitHabitFor.bind(null, normalizedEmail);
  const removePendingWorkout = removePendingWorkoutFor.bind(null, normalizedEmail);
  const removePendingHabit = removePendingHabitFor.bind(null, normalizedEmail);

  const groupedPendingWorkouts = pendingWorkouts.reduce<Array<{
    id: string;
    templateName: string;
    scheduledFor: string;
    cadenceTag: string | null;
    cadenceDetail: string | null;
    cascadeFromDate: string | null;
  }>>((acc, row) => {
    if (!row.seriesId) {
      acc.push({
        id: row.id,
        templateName: row.templateName,
        scheduledFor: row.scheduledFor,
        cadenceTag: null,
        cadenceDetail: null,
        cascadeFromDate: null,
      });
      return acc;
    }

    const recurrence = row.recurrence;
    const cadenceTag =
      recurrence?.kind === "daily"
        ? "Diario"
        : recurrence?.kind === "weekly"
          ? "Semanal"
          : recurrence?.kind === "weekly_days"
            ? "Semanal"
            : recurrence?.kind === "every_n_days"
              ? `Cada ${recurrence.everyN} días`
              : recurrence?.kind === "monthly"
                ? `Mensual · día ${recurrence.dayOfMonth}`
                : "Recurrente";
    const cadenceDetail =
      recurrence?.kind === "weekly"
        ? WEEKDAY_LABELS_WORKOUT[recurrence.weekday] ?? null
        : recurrence?.kind === "weekly_days"
          ? recurrence.weekdays
              .map((day) => WEEKDAY_LABELS_WORKOUT[day])
              .filter((day): day is string => Boolean(day))
              .join(", ")
          : null;

    const existing = acc.find((entry) => entry.cascadeFromDate === `series:${row.seriesId}`);
    if (!existing) {
      acc.push({
        id: row.id,
        templateName: row.templateName,
        scheduledFor: row.scheduledFor,
        cadenceTag,
        cadenceDetail: cadenceDetail || null,
        cascadeFromDate: `series:${row.seriesId}`,
      });
      return acc;
    }

    if (row.scheduledFor < existing.scheduledFor) {
      existing.id = row.id;
      existing.scheduledFor = row.scheduledFor;
    }
    return acc;
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* ── Workouts section ──────────────────────────────────────────── */}
      <section className="rounded-[1.25rem] border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-3 text-base font-semibold">Pre-cargar entrenamientos</h2>

        {pendingWorkouts.length > 0 ? (
          <ul className="mb-4 flex flex-col gap-2">
            {groupedPendingWorkouts.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="font-medium">{row.templateName}</span>
                  {row.cadenceTag ? (
                    <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {row.cadenceTag}
                      {row.cadenceDetail ? ` · ${row.cadenceDetail}` : ""}
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {row.scheduledFor}
                  </span>
                </div>
                <form action={removePendingWorkout}>
                  <input type="hidden" name="assignmentId" value={row.id} />
                  {row.cascadeFromDate ? (
                    <input type="hidden" name="cascadeFromDate" value={row.scheduledFor} />
                  ) : null}
                  <button
                    type="submit"
                    className="rounded border px-2 py-1 text-xs text-muted-foreground hover:bg-background"
                  >
                    Borrar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-muted-foreground">
            Todavía no asignaste entrenamientos a este cliente pendiente.
          </p>
        )}

        <PendingWorkoutAssignForm
          submitAction={submitWorkoutAssignment}
          templates={workoutTemplates.map((t) => ({
            id: t.id,
            name: t.name?.es || t.name?.en || "(sin nombre)",
          }))}
        />
      </section>

      {/* ── Habits section ────────────────────────────────────────────── */}
      <section className="rounded-[1.25rem] border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-3 text-base font-semibold">Pre-cargar hábitos</h2>

        {pendingHabits.length > 0 ? (
          <ul className="mb-4 flex flex-col gap-2">
            {pendingHabits.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="font-medium">{row.name}</span>
                  <span className="text-xs text-muted-foreground">{row.type}</span>
                  <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {row.scheduleType === "one-time"
                      ? "Una vez"
                      : row.scheduleCadence === "weekly"
                        ? `Semanal${
                            row.scheduleWeekdays.length > 0
                              ? ` · ${row.scheduleWeekdays
                                  .map((d) => WEEKDAY_LABELS_HABIT[d])
                                  .filter((v): v is string => Boolean(v))
                                  .join(", ")}`
                              : ""
                          }`
                        : row.scheduleCadence === "monthly"
                          ? `Mensual${
                              row.scheduleMonthDays.length > 0
                                ? ` · ${row.scheduleMonthDays.join(", ")}`
                                : ""
                            }`
                          : "Diaria"}
                  </span>
                </div>
                <form action={removePendingHabit}>
                  <input type="hidden" name="habitId" value={row.id} />
                  <button
                    type="submit"
                    className="rounded border px-2 py-1 text-xs text-muted-foreground hover:bg-background"
                  >
                    Borrar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-muted-foreground">
            Todavía no asignaste hábitos a este cliente pendiente.
          </p>
        )}

        <PendingHabitPreloadForm
          submitAction={submitHabit}
          templates={habitTemplates.map((template) => ({
            id: template.id,
            label: template.name.es || template.name.en || "(sin nombre)",
          }))}
        />

        <p className="mt-3 text-xs text-muted-foreground">
          Pre-carga avanzada: definí el hábito (sí/no) y su recurrencia antes
          del primer ingreso del cliente.
        </p>
      </section>
    </div>
  );
}
