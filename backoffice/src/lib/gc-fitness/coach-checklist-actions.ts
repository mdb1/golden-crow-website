"use server";

import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { getCurrentTrainer } from "./auth-helpers";
import { civilDateFormat, civilDateToday } from "./civil-date";
import { FirestoreCollections } from "./collections";
import { getTrainerTimezone } from "./trainer-timezone";

const CHECKLIST_COLLECTION = "coach_checklist";
const MAX_CHECKLIST_ITEMS = 50;

export interface CoachChecklistItem {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  completed: boolean;
  createdAt: string | null;
}

const createChecklistItemSchema = z.object({
  title: z.string().trim().min(1).max(160),
  notes: z.string().trim().max(500).optional(),
  dueDate: z.string().trim().optional(),
  dueTime: z.string().trim().optional(),
});

const itemIdSchema = z.string().trim().min(1).max(160);

export async function listCoachChecklistItems(): Promise<CoachChecklistItem[]> {
  const trainer = await getCurrentTrainer();
  const snap = await checklistCollection(trainer.uid)
    .orderBy("dueAt", "asc")
    .limit(MAX_CHECKLIST_ITEMS)
    .get();

  return snap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        title: typeof data.title === "string" ? data.title : "Reminder",
        notes:
          typeof data.notes === "string" && data.notes.trim().length > 0
            ? data.notes
            : null,
        dueAt: toIso(data.dueAt),
        completed: data.completed === true,
        createdAt: toIso(data.createdAt),
      };
    })
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
  const trainer = await getCurrentTrainer();
  const parsed = createChecklistItemSchema.parse(input);
  const dueAt = parseDueAt(parsed.dueDate, parsed.dueTime);

  await checklistCollection(trainer.uid).add({
    title: parsed.title,
    ...(parsed.notes ? { notes: parsed.notes } : {}),
    dueAt,
    completed: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  revalidatePath("/gc-fitness/checklist");
  return { ok: true };
}

export async function setCoachChecklistItemCompleted(
  itemId: unknown,
  completed: boolean,
): Promise<{ ok: true }> {
  const trainer = await getCurrentTrainer();
  const parsedItemId = itemIdSchema.parse(itemId);

  await checklistCollection(trainer.uid).doc(parsedItemId).update({
    completed,
    completedAt: completed ? FieldValue.serverTimestamp() : FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  revalidatePath("/gc-fitness/checklist");
  return { ok: true };
}

export async function deleteCoachChecklistItem(
  itemId: unknown,
): Promise<{ ok: true }> {
  const trainer = await getCurrentTrainer();
  const parsedItemId = itemIdSchema.parse(itemId);

  await checklistCollection(trainer.uid).doc(parsedItemId).delete();

  revalidatePath("/gc-fitness/checklist");
  return { ok: true };
}

function checklistCollection(uid: string) {
  return gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .doc(uid)
    .collection(CHECKLIST_COLLECTION);
}

function parseDueAt(date?: string, time?: string): Date | null {
  if (!date) return null;
  const normalizedTime = time && /^\d{2}:\d{2}$/.test(time) ? time : "09:00";
  const dueAt = new Date(`${date}T${normalizedTime}:00`);
  return Number.isNaN(dueAt.getTime()) ? null : dueAt;
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
