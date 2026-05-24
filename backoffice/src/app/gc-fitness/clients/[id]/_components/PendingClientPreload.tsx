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
  listPendingAssignments,
} from "@/lib/gc-fitness/workout-assignment-actions";
import {
  createPendingHabit,
  listPendingHabits,
} from "@/lib/gc-fitness/habit-actions";
import { listWorkoutTemplates } from "@/lib/gc-fitness/workout-template-actions";
import { revalidatePath } from "next/cache";

export async function PendingClientPreload({
  normalizedEmail,
}: {
  normalizedEmail: string;
}) {
  const [{ templates }, pendingWorkouts, pendingHabits] = await Promise.all([
    listWorkoutTemplates(),
    listPendingAssignments(normalizedEmail),
    listPendingHabits(normalizedEmail),
  ]);

  async function submitWorkoutAssignment(formData: FormData) {
    "use server";
    const templateId = String(formData.get("templateId") ?? "");
    const scheduledFor = String(formData.get("scheduledFor") ?? "");
    if (!templateId || !scheduledFor) return;
    await assignTemplateToPending({
      templateId,
      pendingEmail: normalizedEmail,
      scheduledFor,
    });
    revalidatePath(`/gc-fitness/clients/mirror:${normalizedEmail}`);
    revalidatePath(`/gc-fitness/clients/pending/${encodeURIComponent(normalizedEmail)}`);
  }

  async function submitHabit(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    // Minimal v1 — only binary habits in the pre-load UI. Full type
    // surface (multi-choice / numeric / weight) shipped as a follow-on.
    await createPendingHabit(normalizedEmail, {
      type: "binary",
      name,
      clientId: `pending:${normalizedEmail}`, // overridden by createPendingHabit
      reminderEnabled: false,
      scheduleType: "everyday",
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

        <form action={submitWorkoutAssignment} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-medium">Template</span>
            <select
              name="templateId"
              required
              className="rounded border bg-background px-3 py-2 text-sm"
            >
              <option value="">Elegí un template…</option>
              {templates.map((t) => (
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
          <button
            type="submit"
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Pre-cargar
          </button>
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

        <form action={submitHabit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-medium">Nombre del hábito (binario)</span>
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
          <button
            type="submit"
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Pre-cargar
          </button>
        </form>

        <p className="mt-3 text-xs text-muted-foreground">
          v1 solo soporta hábitos binarios en pre-carga. Una vez que el
          cliente ingrese vas a poder agregar hábitos de tipo numérico,
          multi-choice o peso desde la vista normal.
        </p>
      </section>
    </div>
  );
}
