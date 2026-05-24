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
  listPendingAssignments,
} from "@/lib/gc-fitness/workout-assignment-actions";
import {
  assignHabitTemplateToPending,
  createPendingHabit,
  listHabitTemplates,
  listPendingHabits,
} from "@/lib/gc-fitness/habit-actions";
import { listWorkoutTemplates } from "@/lib/gc-fitness/workout-template-actions";
import { revalidatePath } from "next/cache";

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
    if (templateId) {
      await assignHabitTemplateToPending({
        templateId,
        pendingEmail: normalizedEmail,
      });
      revalidatePath(`/gc-fitness/clients/mirror:${normalizedEmail}`);
      revalidatePath(`/gc-fitness/clients/pending/${encodeURIComponent(normalizedEmail)}`);
      return;
    }
    if (!name) return;
    const options = optionsRaw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    const targetValue = targetRaw.length > 0 ? Number(targetRaw) : undefined;

    await createPendingHabit(normalizedEmail, {
      type,
      name,
      options: options.length > 0 ? options : undefined,
      targetValue: Number.isFinite(targetValue) ? targetValue : undefined,
      unit: unitRaw.length > 0 ? unitRaw : undefined,
      clientId: `pending:${normalizedEmail}`, // overridden by createPendingHabit
      reminderEnabled: false,
      scheduleType: "recurring",
      startsOn: new Date().toISOString().slice(0, 10),
    });
    revalidatePath(`/gc-fitness/clients/mirror:${normalizedEmail}`);
    revalidatePath(`/gc-fitness/clients/pending/${encodeURIComponent(normalizedEmail)}`);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Workouts section ──────────────────────────────────────────── */}
      <section className="rounded-md border bg-card p-6">
        <h2 className="mb-3 text-base font-semibold">Pre-cargar workouts</h2>

        {pendingWorkouts.length > 0 ? (
          <ul className="mb-4 flex flex-col gap-2">
            {pendingWorkouts.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm"
              >
                <span className="font-medium">{row.templateName}</span>
                <span className="text-xs text-muted-foreground">
                  {row.scheduledFor}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-muted-foreground">
            Todavía no asignaste workouts a este cliente pendiente.
          </p>
        )}

        <form action={submitWorkoutAssignment} className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Template</span>
              <select
                name="templateId"
                required
                className="rounded border bg-background px-3 py-2 text-sm"
              >
                <option value="">Elegí un template…</option>
                {workoutTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name?.es || t.name?.en || "(sin nombre)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Fecha</span>
              <input
                type="date"
                name="scheduledFor"
                required
                className="rounded border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Modo</span>
              <select
                name="mode"
                className="rounded border bg-background px-3 py-2 text-sm"
                defaultValue="once"
              >
                <option value="once">Una vez</option>
                <option value="weekly">Semanal</option>
                <option value="daily">Diario</option>
                <option value="everyN">Cada N días</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Cada N</span>
              <input
                type="number"
                name="everyN"
                min={2}
                max={30}
                defaultValue={2}
                className="rounded border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Fin (opcional)</span>
              <input
                type="date"
                name="endDate"
                className="rounded border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Hora (opcional)</span>
              <input
                type="time"
                name="scheduledTime"
                className="rounded border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="font-medium">Notas (opcional)</span>
              <input
                type="text"
                name="meetingNotes"
                placeholder="Link o detalle de sesión"
                className="rounded border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          <fieldset className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Weekdays</span>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 1, label: "Lun" },
                { value: 2, label: "Mar" },
                { value: 3, label: "Mié" },
                { value: 4, label: "Jue" },
                { value: 5, label: "Vie" },
                { value: 6, label: "Sáb" },
                { value: 0, label: "Dom" },
              ].map((day) => (
                <label key={day.value} className="inline-flex items-center gap-1 rounded border px-2 py-1">
                  <input
                    type="checkbox"
                    name="weekdays"
                    value={String(day.value)}
                    defaultChecked={day.value === 1}
                  />
                  <span>{day.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Pre-cargar
            </button>
          </div>
        </form>
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
                <span className="font-medium">{row.name}</span>
                <span className="text-xs text-muted-foreground">{row.type}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-muted-foreground">
            Todavía no asignaste hábitos a este cliente pendiente.
          </p>
        )}

        <form action={submitHabit} className="flex flex-col gap-4">
          <div className="grid gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Hábito existente (opcional)</span>
              <select
                name="templateId"
                defaultValue=""
                className="rounded border bg-background px-3 py-2 text-sm"
              >
                <option value="">Crear uno nuevo…</option>
                {habitTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {(template.name.es || template.name.en || "(sin nombre)") + " · " + template.type}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                Si elegís un hábito existente, se ignoran los campos de abajo y se pre-carga ese template.
              </span>
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Nombre del hábito</span>
              <input
                type="text"
                name="name"
                required
                minLength={1}
                maxLength={80}
                placeholder="Ej: 10 minutos de meditación"
                className="rounded border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Tipo</span>
              <select
                name="type"
                defaultValue="binary"
                className="rounded border bg-background px-3 py-2 text-sm"
              >
                <option value="binary">Binary</option>
                <option value="multi-choice">Multi-choice</option>
                <option value="numeric">Numeric</option>
                <option value="weight">Weight</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Opciones (coma separadas)</span>
              <input
                type="text"
                name="options"
                placeholder="Alta, Media, Baja"
                className="rounded border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Target</span>
              <input
                type="number"
                name="targetValue"
                step="any"
                className="rounded border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Unidad</span>
              <input
                type="text"
                name="unit"
                placeholder="kg, reps, min..."
                className="rounded border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Pre-cargar
            </button>
          </div>
        </form>

        <p className="mt-3 text-xs text-muted-foreground">
          Pre-carga avanzada: podés definir tipo, opciones, target y unidad
          antes del primer ingreso del cliente.
        </p>
      </section>
    </div>
  );
}
