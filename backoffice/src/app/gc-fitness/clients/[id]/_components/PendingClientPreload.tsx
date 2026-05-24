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

import {
  assignTemplateToPending,
  assignTemplateRecurringToPending,
  deleteAssignment,
  listPendingAssignments,
} from "@/lib/gc-fitness/workout-assignment-actions";
import {
  createPendingHabit,
  listHabitTemplates,
  listPendingHabits,
  softDeleteHabit,
} from "@/lib/gc-fitness/habit-actions";
import { listWorkoutTemplates } from "@/lib/gc-fitness/workout-template-actions";
import { revalidatePath } from "next/cache";
import { PendingWorkoutAssignForm } from "./PendingWorkoutAssignForm";
import { PendingHabitPreloadForm } from "./PendingHabitPreloadForm";

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

  async function submitWorkoutAssignment(formData: FormData) {
    "use server";
    const templateId = String(formData.get("templateId") ?? "");
    const scheduledFor = String(formData.get("scheduledFor") ?? "");
    const mode = String(formData.get("mode") ?? "once");
    const endDate = String(formData.get("endDate") ?? "").trim();
    const scheduledTime = String(formData.get("scheduledTime") ?? "").trim();
    const meetingNotes = String(formData.get("meetingNotes") ?? "").trim();
    const weekdays = formData
      .getAll("weekdays")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
    const everyNRaw = Number(formData.get("everyN") ?? 2);
    const everyN = Number.isFinite(everyNRaw) ? Math.max(2, Math.min(30, everyNRaw)) : 2;
    if (!templateId || !scheduledFor) return;
    if (mode === "once") {
      await assignTemplateToPending({
        templateId,
        pendingEmail: normalizedEmail,
        scheduledFor,
        scheduledTime: scheduledTime || undefined,
        meetingNotes: meetingNotes || undefined,
      });
    } else {
      const recurrence =
        mode === "daily"
          ? ({ kind: "daily" } as const)
          : mode === "everyN"
            ? ({ kind: "every_n_days", everyN } as const)
            : weekdays.length > 1
              ? ({ kind: "weekly_days", weekdays } as const)
              : ({ kind: "weekly", weekday: weekdays[0] ?? 1 } as const);
      await assignTemplateRecurringToPending({
        templateId,
        pendingEmail: normalizedEmail,
        startDate: scheduledFor,
        recurrence,
        endDate: endDate || undefined,
        scheduledTime: scheduledTime || undefined,
        meetingNotes: meetingNotes || undefined,
      });
    }
    revalidatePath(`/gc-fitness/clients/mirror:${normalizedEmail}`);
    revalidatePath(`/gc-fitness/clients/pending/${encodeURIComponent(normalizedEmail)}`);
  }

  async function submitHabit(formData: FormData) {
    "use server";
    const templateId = String(formData.get("templateId") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const type = String(formData.get("type") ?? "binary");
    const optionsRaw = String(formData.get("options") ?? "").trim();
    const targetRaw = String(formData.get("targetValue") ?? "").trim();
    const unitRaw = String(formData.get("unit") ?? "").trim();
    const scheduleType = String(formData.get("scheduleType") ?? "recurring");
    const startsOn = String(formData.get("startsOn") ?? "").trim();
    const endsOn = String(formData.get("endsOn") ?? "").trim();
    const scheduleCadence = String(formData.get("scheduleCadence") ?? "daily");
    const scheduleWeekdays = formData
      .getAll("scheduleWeekdays")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7);
    const scheduleDayOfMonthRaw = Number(formData.get("scheduleDayOfMonth") ?? 0);
    const scheduleDayOfMonth =
      Number.isInteger(scheduleDayOfMonthRaw) && scheduleDayOfMonthRaw >= 1 && scheduleDayOfMonthRaw <= 31
        ? scheduleDayOfMonthRaw
        : undefined;
    const selectedTemplate = templateId
      ? habitTemplates.find((template) => template.id === templateId)
      : null;
    if (!selectedTemplate && !name) return;
    const options = optionsRaw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    const targetValue = targetRaw.length > 0 ? Number(targetRaw) : undefined;
    const startsOnValue = startsOn || new Date().toISOString().slice(0, 10);
    const resolvedType = (selectedTemplate?.type ?? type) as "binary" | "multi-choice" | "numeric" | "weight";
    const resolvedScheduleType = scheduleType === "one-time" ? "one-time" : "recurring";
    const resolvedCadence =
      scheduleCadence === "weekly" || scheduleCadence === "monthly" ? scheduleCadence : "daily";
    const parsedTarget =
      Number.isFinite(targetValue) && resolvedType === "numeric" ? targetValue : undefined;
    const parsedUnit =
      unitRaw.length > 0 && (resolvedType === "numeric" || resolvedType === "weight")
        ? unitRaw
        : undefined;
    const parsedOptions =
      resolvedType === "multi-choice" && options.length > 0 ? options : undefined;
    const parsedWeekdays =
      resolvedScheduleType === "recurring" && resolvedCadence === "weekly" && scheduleWeekdays.length > 0
        ? scheduleWeekdays
        : undefined;
    const parsedMonthDays =
      resolvedScheduleType === "recurring" && resolvedCadence === "monthly" && scheduleDayOfMonth !== undefined
        ? [scheduleDayOfMonth]
        : undefined;

    const resolvedName = selectedTemplate
      ? {
          en: selectedTemplate.name.en,
          es: selectedTemplate.name.es,
        }
      : name;

    await createPendingHabit(normalizedEmail, {
      type: resolvedType,
      name: resolvedName,
      options: parsedOptions ?? selectedTemplate?.options,
      targetValue:
        parsedTarget !== undefined
          ? parsedTarget
          : selectedTemplate?.targetValue,
      unit: parsedUnit ?? selectedTemplate?.unit,
      clientId: `pending:${normalizedEmail}`, // overridden by createPendingHabit
      reminderEnabled: false,
      scheduleType: resolvedScheduleType,
      startsOn: startsOnValue,
      endsOn: endsOn || undefined,
      scheduleCadence: resolvedScheduleType === "recurring" ? resolvedCadence : undefined,
      scheduleWeekdays: parsedWeekdays,
      scheduleDayOfMonth:
        resolvedScheduleType === "recurring" && resolvedCadence === "monthly"
          ? scheduleDayOfMonth
          : undefined,
      scheduleMonthDays: parsedMonthDays,
    });
    revalidatePath(`/gc-fitness/clients/mirror:${normalizedEmail}`);
    revalidatePath(`/gc-fitness/clients/pending/${encodeURIComponent(normalizedEmail)}`);
  }

  async function removePendingWorkout(formData: FormData) {
    "use server";
    const assignmentId = String(formData.get("assignmentId") ?? "").trim();
    const cascadeFromDate = String(formData.get("cascadeFromDate") ?? "").trim();
    if (!assignmentId) return;
    await deleteAssignment(
      assignmentId,
      cascadeFromDate ? { cascadeFromDate } : undefined,
    );
    revalidatePath(`/gc-fitness/clients/mirror:${normalizedEmail}`);
    revalidatePath(`/gc-fitness/clients/pending/${encodeURIComponent(normalizedEmail)}`);
  }

  async function removePendingHabit(formData: FormData) {
    "use server";
    const habitId = String(formData.get("habitId") ?? "").trim();
    if (!habitId) return;
    await softDeleteHabit(habitId);
    revalidatePath(`/gc-fitness/clients/mirror:${normalizedEmail}`);
    revalidatePath(`/gc-fitness/clients/pending/${encodeURIComponent(normalizedEmail)}`);
  }

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
            ? "Semanal (varios días)"
            : recurrence?.kind === "every_n_days"
              ? `Cada ${recurrence.everyN} días`
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
      <section className="rounded-md border bg-card p-6">
        <h2 className="mb-3 text-base font-semibold">Pre-cargar workouts</h2>

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
            Todavía no asignaste workouts a este cliente pendiente.
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
      <section className="rounded-md border bg-card p-6">
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
            label: `${template.name.es || template.name.en || "(sin nombre)"} · ${template.type}`,
            type: template.type,
          }))}
        />

        <p className="mt-3 text-xs text-muted-foreground">
          Pre-carga avanzada: podés definir tipo, opciones, target y unidad
          antes del primer ingreso del cliente.
        </p>
      </section>
    </div>
  );
}
