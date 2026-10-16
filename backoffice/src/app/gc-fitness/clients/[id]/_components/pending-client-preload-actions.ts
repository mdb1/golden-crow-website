"use server";

// pending-client-preload-actions.ts
//
// #382 — the pending-client preload forms (formerly inline closures in
// PendingClientPreload.tsx). `normalizedEmail` arrives through `.bind`, which
// the client can see and alter — every action called below re-checks that the
// pending mirror belongs to the calling coach, so altering it grants nothing.
// Inline "use server" closures are named by POSITION ($$RSC_SERVER_ACTION_N),
// so adding or reordering one in the page re-pointed an old tab's action ID at
// a DIFFERENT closure — measured: "promote to admin" ran "add to allowlist".
// Named exports here keep their ID while their name and file don't change.
// Only async functions may be exported from this file (`next build` rejects
// anything else).

import { revalidatePath } from "next/cache";

import {
  assignTemplateRecurringToPending,
  assignTemplateToPending,
  deleteAssignment,
} from "@/lib/gc-fitness/workout-assignment-actions";
import {
  createPendingHabit,
  listHabitTemplates,
  softDeleteHabit,
} from "@/lib/gc-fitness/habit-actions";
import { civilDateToday } from "@/lib/gc-fitness/civil-date";
import { getTrainerTimezone } from "@/lib/gc-fitness/trainer-timezone";

export async function submitWorkoutAssignment(
  normalizedEmail: string,
  formData: FormData,
) {
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
    const [, , dayStr] = scheduledFor.split("-");
    const dayOfMonth = Number(dayStr) || 1;
    const recurrence =
      mode === "daily"
        ? ({ kind: "daily" } as const)
        : mode === "everyN"
          ? ({ kind: "every_n_days", everyN } as const)
          : mode === "monthly"
            ? ({ kind: "monthly", dayOfMonth } as const)
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

export async function submitHabit(
  normalizedEmail: string,
  formData: FormData,
) {
  const templateId = String(formData.get("templateId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  // Habits are binary-only — `type` is always "binary".
  const scheduleType = String(formData.get("scheduleType") ?? "recurring");
  const startsOn = String(formData.get("startsOn") ?? "").trim();
  const endsOn = String(formData.get("endsOn") ?? "").trim();
  const scheduleCadence = String(formData.get("scheduleCadence") ?? "daily");
  const scheduleWeekdays = formData
    .getAll("scheduleWeekdays")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7);
  const scheduleMonthDays = formData
    .getAll("scheduleMonthDays")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 31)
    .sort((a, b) => a - b);
  const scheduleDayOfMonthRaw = Number(formData.get("scheduleDayOfMonth") ?? 0);
  const scheduleDayOfMonth =
    Number.isInteger(scheduleDayOfMonthRaw) && scheduleDayOfMonthRaw >= 1 && scheduleDayOfMonthRaw <= 31
      ? scheduleDayOfMonthRaw
      : undefined;
  // Read at submit time (it used to be the list captured at render).
  const habitTemplates = templateId ? await listHabitTemplates() : [];
  const selectedTemplate = templateId
    ? habitTemplates.find((template) => template.id === templateId)
    : null;
  if (!selectedTemplate && !name) return;
  // #747 — the coach's civil day, not the server's UTC one.
  const startsOnValue = startsOn || civilDateToday(await getTrainerTimezone());
  const resolvedType = "binary" as const;
  const resolvedScheduleType = scheduleType === "one-time" ? "one-time" : "recurring";
  const resolvedCadence =
    scheduleCadence === "weekly" || scheduleCadence === "monthly" ? scheduleCadence : "daily";
  const parsedWeekdays =
    resolvedScheduleType === "recurring" && resolvedCadence === "weekly" && scheduleWeekdays.length > 0
      ? scheduleWeekdays
      : undefined;
  const parsedMonthDays =
    resolvedScheduleType === "recurring" && resolvedCadence === "monthly"
      ? scheduleMonthDays.length > 0
        ? scheduleMonthDays
        : scheduleDayOfMonth !== undefined
          ? [scheduleDayOfMonth]
          : undefined
      : undefined;

  // #451: `habitCreateSchema.name` is a strict `{ en, es }` object, so the
  // free-text name is mirrored into both languages (the form has one field).
  // Sending the bare string made every free-text pending preload throw.
  const resolvedName = selectedTemplate
    ? {
        en: selectedTemplate.name.en,
        es: selectedTemplate.name.es,
      }
    : { en: name, es: name };

  await createPendingHabit(normalizedEmail, {
    type: resolvedType,
    name: resolvedName,
    clientId: `pending:${normalizedEmail}`, // overridden by createPendingHabit
    reminderEnabled: false,
    scheduleType: resolvedScheduleType,
    startsOn: startsOnValue,
    endsOn: endsOn || undefined,
    scheduleCadence: resolvedScheduleType === "recurring" ? resolvedCadence : undefined,
    scheduleWeekdays: parsedWeekdays,
    scheduleDayOfMonth:
      resolvedScheduleType === "recurring" && resolvedCadence === "monthly"
        ? parsedMonthDays?.[0]
        : undefined,
    scheduleMonthDays: parsedMonthDays,
  });
  revalidatePath(`/gc-fitness/clients/mirror:${normalizedEmail}`);
  revalidatePath(`/gc-fitness/clients/pending/${encodeURIComponent(normalizedEmail)}`);
}

export async function removePendingWorkout(
  normalizedEmail: string,
  formData: FormData,
) {
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

export async function removePendingHabit(
  normalizedEmail: string,
  formData: FormData,
) {
  const habitId = String(formData.get("habitId") ?? "").trim();
  if (!habitId) return;
  await softDeleteHabit(habitId);
  revalidatePath(`/gc-fitness/clients/mirror:${normalizedEmail}`);
  revalidatePath(`/gc-fitness/clients/pending/${encodeURIComponent(normalizedEmail)}`);
}
