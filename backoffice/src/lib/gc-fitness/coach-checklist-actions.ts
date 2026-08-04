"use server";

import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { getCurrentTrainer } from "./auth-helpers";
import { civilDateFormat, civilDateToday } from "./civil-date";
import { listClients } from "./client-roster";
import { FirestoreCollections } from "./collections";
import { getTrainerTimezone } from "./trainer-timezone";
import { zonedWallClockInstant } from "./zoned-instant";

const CHECKLIST_COLLECTION = "coach_checklist";
const MAX_CHECKLIST_ITEMS = 50;

/** Reminder recurrence — "none" is a one-off (default). */
export type ChecklistRecurrence = "none" | "daily" | "weekly" | "monthly";

export interface CoachChecklistItem {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  completed: boolean;
  createdAt: string | null;
  /** Clients this reminder is about (each links to /gc-fitness/clients/[id]).
   *  Empty when the reminder isn't tied to anyone. */
  clients: Array<{ id: string; name: string }>;
  recurrence: ChecklistRecurrence;
  /** Recurrence end date (YYYY-MM-DD) or null for "no end". */
  recurrenceEndsOn: string | null;
  /** Selected weekdays (1=Mon … 7=Sun) for weekly recurrence. */
  recurrenceWeekdays: number[];
  /** Selected days of month (1..31) for monthly recurrence. */
  recurrenceMonthDays: number[];
}

const createChecklistItemSchema = z.object({
  title: z.string().trim().min(1).max(160),
  notes: z.string().trim().max(500).optional(),
  dueDate: z.string().trim().optional(),
  dueTime: z.string().trim().optional(),
  clientIds: z.array(z.string().trim().min(1).max(128)).max(50).optional(),
  recurrence: z.enum(["none", "daily", "weekly", "monthly"]).optional(),
  recurrenceEndsOn: z.string().trim().optional(),
  recurrenceWeekdays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  recurrenceMonthDays: z.array(z.number().int().min(1).max(31)).max(31).optional(),
});

function normalizeRecurrence(value: unknown): ChecklistRecurrence {
  return value === "daily" || value === "weekly" || value === "monthly"
    ? value
    : "none";
}

function isoWeekday(d: Date): number {
  const g = d.getDay(); // 0=Sun … 6=Sat
  return g === 0 ? 7 : g; // → 1=Mon … 7=Sun
}

function sanitizeIntArray(value: unknown, min: number, max: number): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= min && n <= max);
}

/**
 * Roll a due date forward to the NEXT occurrence, preserving the time of day.
 * - daily: +1 day
 * - weekly: next day whose ISO weekday is in `weekdays` (fallback +7)
 * - monthly: next date whose day-of-month is in `monthDays` (fallback +1 month)
 * Returns null for "none"/invalid.
 */
function advanceDueDate(
  iso: string,
  recurrence: ChecklistRecurrence,
  weekdays: number[] = [],
  monthDays: number[] = [],
): Date | null {
  const current = new Date(iso);
  if (Number.isNaN(current.getTime())) return null;

  if (recurrence === "daily") {
    const next = new Date(current);
    next.setDate(next.getDate() + 1);
    return next;
  }
  if (recurrence === "weekly") {
    const set = weekdays.length > 0 ? new Set(weekdays) : null;
    for (let i = 1; i <= 7; i += 1) {
      const cand = new Date(current);
      cand.setDate(cand.getDate() + i);
      if (!set || set.has(isoWeekday(cand))) return cand;
    }
    const fallback = new Date(current);
    fallback.setDate(fallback.getDate() + 7);
    return fallback;
  }
  if (recurrence === "monthly") {
    const set = monthDays.length > 0 ? new Set(monthDays) : null;
    for (let i = 1; i <= 62; i += 1) {
      const cand = new Date(current);
      cand.setDate(cand.getDate() + i);
      if (!set || set.has(cand.getDate())) return cand;
    }
    const fallback = new Date(current);
    fallback.setMonth(fallback.getMonth() + 1);
    return fallback;
  }
  return null;
}

/**
 * Parse a "YYYY-MM-DD" end date into the last instant of that day IN THE
 * COACH'S ZONE — not in the server's (#747).
 */
function parseRecurrenceEnd(endsOn: string | undefined, timezone: string): Date | null {
  if (!endsOn || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) return null;
  const lastMinute = zonedWallClockInstant(endsOn, "23:59", timezone);
  return lastMinute ? new Date(lastMinute.getTime() + 59_000) : null;
}

/**
 * Render a stored Timestamp/Date back to a civil "YYYY-MM-DD" string, in the
 * coach's zone. The host getters this replaced read UTC on Vercel, so the edit
 * form's "ends on" could show the day AFTER the one that was saved (#747).
 */
function toCivilDate(value: unknown, timezone: string): string | null {
  const iso = toIso(value);
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return civilDateFormat(d, timezone);
}

const itemIdSchema = z.string().trim().min(1).max(160);

// The dashboard "Pendientes de tu checklist" widget reads the same
// coach_checklist subcollection, so every mutation must revalidate both routes
// or the widget shows stale items after a toggle/edit/delete from either page.
function revalidateChecklistSurfaces() {
  revalidatePath("/gc-fitness/checklist");
  revalidatePath("/gc-fitness/dashboard");
}

export async function listCoachChecklistItems(): Promise<CoachChecklistItem[]> {
  const [trainer, timezone] = await Promise.all([
    getCurrentTrainer(),
    getTrainerTimezone(),
  ]);
  const snap = await checklistCollection(trainer.uid)
    .orderBy("dueAt", "asc")
    .limit(MAX_CHECKLIST_ITEMS)
    .get();

  // Each row carries its linked client UIDs; names are resolved below.
  const rows = snap.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    // New docs store `clientIds: string[]`; legacy docs stored a single
    // `clientId` — read both so old reminders keep their link.
    const ids = Array.isArray(data.clientIds)
      ? data.clientIds.filter(
          (v): v is string => typeof v === "string" && v.length > 0,
        )
      : typeof data.clientId === "string" && data.clientId.length > 0
        ? [data.clientId]
        : [];
    return {
      item: {
        id: doc.id,
        title: typeof data.title === "string" ? data.title : "Reminder",
        notes:
          typeof data.notes === "string" && data.notes.trim().length > 0
            ? data.notes
            : null,
        dueAt: toIso(data.dueAt),
        completed: data.completed === true,
        createdAt: toIso(data.createdAt),
        clients: [] as Array<{ id: string; name: string }>,
        recurrence: normalizeRecurrence(data.recurrence),
        recurrenceEndsOn: toCivilDate(data.recurrenceEndsAt, timezone),
        recurrenceWeekdays: sanitizeIntArray(data.recurrenceWeekdays, 1, 7),
        recurrenceMonthDays: sanitizeIntArray(data.recurrenceMonthDays, 1, 31),
      } satisfies CoachChecklistItem,
      clientIds: ids,
    };
  });

  // Resolve display names for every linked client (one cached roster read).
  const allClientIds = new Set(rows.flatMap((r) => r.clientIds));
  let nameByUid = new Map<string, string>();
  if (allClientIds.size > 0) {
    try {
      const roster = await listClients();
      nameByUid = new Map(roster.map((c) => [c.uid, c.displayName]));
    } catch {
      // Best-effort — fall back to the raw uid if the roster read fails.
    }
  }
  for (const row of rows) {
    row.item.clients = row.clientIds.map((id) => ({
      id,
      name: nameByUid.get(id) ?? id,
    }));
  }

  return rows
    .map((r) => r.item)
    .sort((a, b) => Number(a.completed) - Number(b.completed));
}

export type PendingChecklistBucket = "overdue" | "today";

export interface PendingChecklistItem extends CoachChecklistItem {
  bucket: PendingChecklistBucket;
}

/**
 * Dashboard widget feed: the coach's incomplete checklist items that are
 * either already overdue or due today, in the coach's own timezone.
 *
 * Reuses `listCoachChecklistItems()` (a single ≤50-doc read of the
 * `coach_checklist` subcollection), so adding this to the dashboard costs at
 * most ~50 extra document reads per load. "today" is computed against the
 * trainer's civil date (`getTrainerTimezone`), and "overdue" is any dated,
 * incomplete item whose due civil date is strictly before today. Items with no
 * `dueAt` never appear here (they can't be overdue or due-today).
 *
 * Order: overdue first (oldest due date first), then today's items.
 */
export async function listPendingChecklistItems(): Promise<
  PendingChecklistItem[]
> {
  const [items, timezone] = await Promise.all([
    listCoachChecklistItems(),
    getTrainerTimezone(),
  ]);
  const today = civilDateToday(timezone);

  const pending: PendingChecklistItem[] = [];
  for (const item of items) {
    if (item.completed || !item.dueAt) continue;
    const dueCivil = civilDateFormat(new Date(item.dueAt), timezone);
    if (dueCivil < today) pending.push({ ...item, bucket: "overdue" });
    else if (dueCivil === today) pending.push({ ...item, bucket: "today" });
  }

  // overdue (oldest first) before today; within a bucket keep dueAt ascending
  // (listCoachChecklistItems already returns dueAt-ascending order).
  return pending.sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket === "overdue" ? -1 : 1;
    return (a.dueAt ?? "").localeCompare(b.dueAt ?? "");
  });
}

export async function createCoachChecklistItem(
  input: unknown,
): Promise<{ ok: true }> {
  const [trainer, timezone] = await Promise.all([
    getCurrentTrainer(),
    getTrainerTimezone(),
  ]);
  const parsed = createChecklistItemSchema.parse(input);
  const dueAt = parseDueAt(parsed.dueDate, parsed.dueTime, timezone);

  const recurrence = parsed.recurrence ?? "none";
  const recurrenceEndsAt =
    recurrence !== "none" ? parseRecurrenceEnd(parsed.recurrenceEndsOn, timezone) : null;

  await checklistCollection(trainer.uid).add({
    title: parsed.title,
    ...(parsed.notes ? { notes: parsed.notes } : {}),
    ...(parsed.clientIds && parsed.clientIds.length > 0
      ? { clientIds: parsed.clientIds }
      : {}),
    recurrence,
    ...(recurrenceEndsAt ? { recurrenceEndsAt } : {}),
    ...(recurrence === "weekly" && parsed.recurrenceWeekdays?.length
      ? { recurrenceWeekdays: parsed.recurrenceWeekdays }
      : {}),
    ...(recurrence === "monthly" && parsed.recurrenceMonthDays?.length
      ? { recurrenceMonthDays: parsed.recurrenceMonthDays }
      : {}),
    dueAt,
    completed: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  revalidateChecklistSurfaces();
  return { ok: true };
}

export async function updateCoachChecklistItem(
  itemId: unknown,
  input: unknown,
): Promise<{ ok: true }> {
  const [trainer, timezone] = await Promise.all([
    getCurrentTrainer(),
    getTrainerTimezone(),
  ]);
  const parsedItemId = itemIdSchema.parse(itemId);
  const parsed = createChecklistItemSchema.parse(input);
  const dueAt = parseDueAt(parsed.dueDate, parsed.dueTime, timezone);

  // Empty notes / cleared date are intentional removals, not "leave as-is":
  // delete the notes field and null out dueAt so the item drops back to the
  // "Sin fecha" group. `completed`/`createdAt` are left untouched.
  const recurrence = parsed.recurrence ?? "none";
  const recurrenceEndsAt =
    recurrence !== "none" ? parseRecurrenceEnd(parsed.recurrenceEndsOn, timezone) : null;
  const weekdays =
    recurrence === "weekly" ? parsed.recurrenceWeekdays ?? [] : [];
  const monthDays =
    recurrence === "monthly" ? parsed.recurrenceMonthDays ?? [] : [];

  await checklistCollection(trainer.uid)
    .doc(parsedItemId)
    .update({
      title: parsed.title,
      notes: parsed.notes ? parsed.notes : FieldValue.delete(),
      clientIds:
        parsed.clientIds && parsed.clientIds.length > 0
          ? parsed.clientIds
          : FieldValue.delete(),
      // Drop the legacy single-client field on any edit.
      clientId: FieldValue.delete(),
      recurrence,
      // Cleared / inapplicable recurrence sub-fields are removed, not left stale.
      recurrenceEndsAt: recurrenceEndsAt ?? FieldValue.delete(),
      recurrenceWeekdays:
        weekdays.length > 0 ? weekdays : FieldValue.delete(),
      recurrenceMonthDays:
        monthDays.length > 0 ? monthDays : FieldValue.delete(),
      dueAt,
      updatedAt: FieldValue.serverTimestamp(),
    });

  revalidateChecklistSurfaces();
  return { ok: true };
}

export async function setCoachChecklistItemCompleted(
  itemId: unknown,
  completed: boolean,
): Promise<{ ok: true }> {
  const trainer = await getCurrentTrainer();
  const parsedItemId = itemIdSchema.parse(itemId);
  const ref = checklistCollection(trainer.uid).doc(parsedItemId);

  // For a RECURRING reminder, "completing" an occurrence rolls its due date
  // forward to the next one and keeps it active, instead of marking it done.
  if (completed) {
    const snap = await ref.get();
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const recurrence = normalizeRecurrence(data.recurrence);
    const dueIso = toIso(data.dueAt);
    if (recurrence !== "none" && dueIso) {
      const next = advanceDueDate(
        dueIso,
        recurrence,
        sanitizeIntArray(data.recurrenceWeekdays, 1, 7),
        sanitizeIntArray(data.recurrenceMonthDays, 1, 31),
      );
      const endsAtIso = toIso(data.recurrenceEndsAt);
      const pastEnd =
        next !== null &&
        endsAtIso !== null &&
        next.getTime() > new Date(endsAtIso).getTime();
      // Roll forward to the next occurrence UNLESS we've passed the end date —
      // then fall through and mark the reminder completed for good.
      if (next && !pastEnd) {
        await ref.update({
          dueAt: next,
          completed: false,
          completedAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        revalidateChecklistSurfaces();
        return { ok: true };
      }
    }
  }

  await ref.update({
    completed,
    completedAt: completed ? FieldValue.serverTimestamp() : FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  revalidateChecklistSurfaces();
  return { ok: true };
}

export async function deleteCoachChecklistItem(
  itemId: unknown,
): Promise<{ ok: true }> {
  const trainer = await getCurrentTrainer();
  const parsedItemId = itemIdSchema.parse(itemId);

  await checklistCollection(trainer.uid).doc(parsedItemId).delete();

  revalidateChecklistSurfaces();
  return { ok: true };
}

function checklistCollection(uid: string) {
  return gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .doc(uid)
    .collection(CHECKLIST_COLLECTION);
}

/**
 * The instant a coach means by "this day at this time".
 *
 * #747 — this used to be `new Date(`${date}T${time}:00`)`, a date-time string
 * with no offset, which JS resolves in the HOST zone: UTC on Vercel. A coach in
 * Buenos Aires setting a reminder for 18:00 stored 18:00Z and read it back as
 * 15:00. The bucketing already worked in their zone (`listPendingChecklist`
 * calls `getTrainerTimezone`), so the stored instant was the odd one out.
 */
function parseDueAt(
  date: string | undefined,
  time: string | undefined,
  timezone: string,
): Date | null {
  if (!date) return null;
  const normalizedTime = time && /^\d{2}:\d{2}$/.test(time) ? time : "09:00";
  return zonedWallClockInstant(date, normalizedTime, timezone);
}

function toIso(value: unknown): string | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}
