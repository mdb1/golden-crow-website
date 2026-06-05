// habit-actions.ts
//
// Server Actions for the GC Fitness trainer Habit CRUD surface.
// This module is the ONLY trainer-writable path to /habits (Firestore rules
// from P06-03 deny client-SDK writes). Every guarantee — allowlist
// enforcement, trainerId set from session, soft-delete-only deletes,
// ownership-scoped list query — lives here.
//
// Threat-register coverage (matches PLAN.md 06-05 <threat_model>):
//   T-06-05-01 (EoP — client forges trainerId on create)
//     → trainerId is added AFTER Zod parse from session.uid. Zod schema
//       strips unknown keys, so a tampered input `trainerId` never survives.
//   T-06-05-02 (Tampering — update foreign trainer's habit)
//     → get()-based ownership precondition before update; throws Forbidden.
//       Defense in depth before the rule layer (P06-03).
//   T-06-05-05 (InfoDisclosure — cross-trainer list leak)
//     → listHabitsForTrainer scopes by trainerId == session.uid.
//       listHabitsForClient relies on rule-layer read precondition.
//   T-06-05-06 (Repudiation — hard delete)
//     → softDeleteHabit only; no hardDeleteHabit export.
//   T-06-05-07 (DoS — unbounded list)
//     → .limit(200) on every list query.
//
// REFERENCE PATTERN: mirrors `workout-template-actions.ts` (P04-04) verbatim
// for getCurrentTrainer integration, FieldValue.serverTimestamp usage, and
// the doc-id scheme (`hab-${trainerUid}-${randomUUID()}`).

"use server";

import { randomUUID } from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import {
  gcFitnessFirestore,
  gcFitnessStorage,
} from "@/lib/firebase/gc-fitness-admin";

import {
  habitCreateSchema,
  habitTemplateCreateSchema,
  habitTemplateUpdateSchema,
  habitUpdateSchemaForType,
  type HabitType,
  type HabitScheduleType,
} from "./habit-schema";
import { getCurrentTrainer } from "./auth-helpers";
import {
  recordCoachActivityEvent,
  markCoachActivityDeleted,
  habitAssignedEvent,
} from "./coach-activity-log";
import { FirestoreCollections } from "./collections";
import { normalizeMirrorEmail } from "./email-normalization";

const COLLECTION = FirestoreCollections.habits;
const TEMPLATE_COLLECTION = FirestoreCollections.habitTemplates;
const TEMPLATE_HIDDEN_COLLECTION = FirestoreCollections.habitTemplateHidden;

// Habit reference-photo upload constraints. Mirrors the exercise-thumbnail
// pattern (exercise-server-actions.ts) — narrower than the 50 MB video cap
// since a habit photo is a single static image.
const MAX_HABIT_PHOTO_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const HABIT_PHOTO_SIGNED_URL_TTL_MS = 60 * 60 * 1000; // 60 minutes
// Allowed image content types for habit photo uploads. Keys are the MIME
// strings the client MUST send (and the signed URL is pinned to); values are
// the extension we append to the object path.
const HABIT_PHOTO_CONTENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function getMediaBucketName(): string {
  return (
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET ??
    "gcfitness-3476b.firebasestorage.app"
  );
}

function isDraftHabitId(habitId: string, trainerUid: string): boolean {
  return habitId.startsWith(`habit-draft-${trainerUid}-`);
}

function parseGsStoragePath(raw: string): { bucket: string; object: string } | null {
  if (!raw.startsWith("gs://")) return null;
  const rest = raw.slice("gs://".length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const bucket = rest.slice(0, slash);
  const object = rest.slice(slash + 1);
  if (!bucket || !object) return null;
  return { bucket, object };
}

async function rehomeDraftHabitPhotoIfNeeded(input: {
  finalHabitId: string;
  trainerUid: string;
  photoUrl?: string;
}): Promise<string | undefined> {
  const { finalHabitId, trainerUid, photoUrl } = input;
  if (!photoUrl) return undefined;

  const parsed = parseGsStoragePath(photoUrl);
  if (!parsed) return undefined;

  const draftPrefix = `habits/habit-draft-${trainerUid}-`;
  if (!parsed.object.startsWith(draftPrefix)) return undefined;

  const extensionMatch = parsed.object.match(/\.([a-z0-9]+)$/i);
  if (!extensionMatch) return undefined;

  const finalObject = `habits/${finalHabitId}/photo.${extensionMatch[1].toLowerCase()}`;
  const bucket = gcFitnessStorage().bucket(parsed.bucket);
  const sourceFile = bucket.file(parsed.object);
  const destFile = bucket.file(finalObject);

  await sourceFile.copy(destFile);
  try {
    await sourceFile.delete();
  } catch {
    // Best-effort cleanup; the important part is that the canonical path now
    // lives under the final habit id and the doc can point at it.
  }

  return `gs://${parsed.bucket}/${finalObject}`;
}

// Global habit templates are BINARY-ONLY (yes/no) now. The former numeric
// (water/sleep/steps/protein) and multi-choice (energy) templates were
// dropped when the product collapsed to binary habits; "Water intake" is kept
// as a yes/no "Drink water" habit so the seed list stays useful.
const GLOBAL_HABIT_TEMPLATES = [
  {
    id: "global-water",
    type: "binary",
    name: { en: "Drink water", es: "Beber agua" },
    description: {
      en: "Did you hit your daily hydration goal?",
      es: "¿Cumpliste tu objetivo diario de hidratación?",
    },
    reminderEnabled: false,
  },
  {
    id: "global-mobility",
    type: "binary",
    name: { en: "Mobility", es: "Movilidad" },
    description: {
      en: "Complete your mobility block.",
      es: "Completa tu bloque de movilidad.",
    },
    reminderEnabled: false,
  },
  {
    id: "global-walk",
    type: "binary",
    name: { en: "30-minute walk", es: "Caminata de 30 minutos" },
    reminderEnabled: false,
  },
  {
    id: "global-food-log",
    type: "binary",
    name: { en: "Food log", es: "Registro de comidas" },
    reminderEnabled: false,
  },
] satisfies Array<{
  id: string;
  type: HabitType;
  name: { en: string; es: string };
  description?: { en: string; es: string };
  reminderEnabled: boolean;
}>;

/**
 * Shape returned by `listHabitsForTrainer` and `listHabitsForClient` —
 * denormalized projection used by trainer-facing list views. Timestamps are
 * converted to ISO strings so React state stays serializable across the
 * Server Action boundary.
 *
 * Field names mirror the wire shape declared in `.planning/schemas/habits.md`
 * (camelCase end-to-end per P06-02 post-fix + P06-03 rules).
 */
export interface HabitRow {
  id: string;
  clientId: string;
  trainerId: string;
  type: HabitType;
  name: { en: string; es: string };
  description?: { en: string; es: string };
  /** Reference photo — `https://` URL or `gs://` Storage path. TS↔Swift parity. */
  photoUrl?: string;
  /** YouTube demo link (youtube.com/watch or youtu.be). TS↔Swift parity. */
  youtubeUrl?: string;
  reminderTime?: string;
  reminderEnabled: boolean;
  reminderCadence?: "daily" | "weekly" | "monthly";
  reminderWeekdays?: number[];
  reminderDayOfMonth?: number;
  reminderMonthDays?: number[];
  scheduleType: HabitScheduleType;
  startsOn: string;
  endsOn?: string;
  scheduleCadence?: "daily" | "weekly" | "monthly";
  scheduleWeekdays?: number[];
  scheduleDayOfMonth?: number;
  scheduleMonthDays?: number[];
  /**
   * Civil dates (YYYY-MM-DD) the trainer removed from this habit's recurrence
   * via the calendar's "quitar de este día" action. The trainer surfaces
   * (month calendar, coach pulse) skip these days.
   */
  skippedDates?: string[];
  seedSource?: string;
  deleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface HabitTemplateRow {
  id: string;
  scope: "global" | "trainer";
  trainerId: string | null;
  type: HabitType;
  name: { en: string; es: string };
  description?: { en: string; es: string };
  photoUrl?: string;
  youtubeUrl?: string;
  reminderTime?: string;
  reminderEnabled: boolean;
  reminderCadence?: "daily" | "weekly" | "monthly";
  reminderWeekdays?: number[];
  reminderDayOfMonth?: number;
  reminderMonthDays?: number[];
  scheduleType: HabitScheduleType;
  startsOn: string;
  endsOn?: string;
  scheduleCadence?: "daily" | "weekly" | "monthly";
  scheduleWeekdays?: number[];
  scheduleDayOfMonth?: number;
  scheduleMonthDays?: number[];
  deleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * Coerces a Firestore Timestamp (or any value exposing `.toDate()`) to an
 * ISO string. Returns null for missing / unknown shapes. Mirrors the
 * `toIso` helper from `workout-template-actions.ts` verbatim.
 */
function toIso(v: unknown): string | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof v === "string") return v;
  return null;
}

function todayCivilDateUTC(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeCivilDateInput(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const raw = v.trim();
  if (raw.length === 0) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmyMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1];
    const month = dmyMatch[2];
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }
  return undefined;
}

function normalizeStartsOn(v: unknown): string {
  return normalizeCivilDateInput(v) ?? todayCivilDateUTC();
}

function normalizeEndsOn(v: unknown): string | undefined {
  return normalizeCivilDateInput(v);
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  ) as T;
}

/**
 * Projects a raw Firestore doc to the serializable `HabitRow` shape.
 * Centralized so list + future single-doc reads stay consistent.
 */
function projectHabitRow(
  id: string,
  data: Record<string, unknown>,
): HabitRow {
  const clientIdRaw =
    typeof data.clientId === "string" ? data.clientId.trim() : "";
  const pendingEmailRaw =
    typeof data.pendingEmail === "string" ? data.pendingEmail.trim().toLowerCase() : "";
  const resolvedClientId =
    clientIdRaw.length > 0
      ? clientIdRaw
      : pendingEmailRaw.length > 0
        ? `mirror:${pendingEmailRaw}`
        : "";

  return {
    id,
    clientId: resolvedClientId,
    trainerId: (data.trainerId as string) ?? "",
    type: (data.type as HabitType) ?? "binary",
    name: (data.name as { en: string; es: string }) ?? { en: "", es: "" },
    description: data.description as { en: string; es: string } | undefined,
    photoUrl: typeof data.photoUrl === "string" ? data.photoUrl : undefined,
    youtubeUrl:
      typeof data.youtubeUrl === "string" ? data.youtubeUrl : undefined,
    reminderTime:
      typeof data.reminderTime === "string" ? data.reminderTime : undefined,
    reminderEnabled: data.reminderEnabled === true,
    reminderCadence:
      data.reminderCadence === "daily" ||
      data.reminderCadence === "weekly" ||
      data.reminderCadence === "monthly"
        ? data.reminderCadence
        : undefined,
    reminderWeekdays: Array.isArray(data.reminderWeekdays)
      ? (data.reminderWeekdays as number[])
      : undefined,
    reminderDayOfMonth:
      typeof data.reminderDayOfMonth === "number"
        ? data.reminderDayOfMonth
        : undefined,
    reminderMonthDays: Array.isArray(data.reminderMonthDays)
      ? (data.reminderMonthDays as number[])
      : typeof data.reminderDayOfMonth === "number"
        ? [data.reminderDayOfMonth]
        : undefined,
    scheduleType:
      data.scheduleType === "one-time" ? "one-time" : "recurring",
    startsOn:
      normalizeStartsOn(data.startsOn),
    endsOn:
      normalizeEndsOn(data.endsOn),
    scheduleCadence:
      data.scheduleCadence === "daily" ||
      data.scheduleCadence === "weekly" ||
      data.scheduleCadence === "monthly"
        ? data.scheduleCadence
        : undefined,
    scheduleWeekdays: Array.isArray(data.scheduleWeekdays)
      ? (data.scheduleWeekdays as number[])
      : undefined,
    scheduleDayOfMonth:
      typeof data.scheduleDayOfMonth === "number"
        ? data.scheduleDayOfMonth
        : undefined,
    scheduleMonthDays: Array.isArray(data.scheduleMonthDays)
      ? (data.scheduleMonthDays as number[])
      : typeof data.scheduleDayOfMonth === "number"
        ? [data.scheduleDayOfMonth]
        : undefined,
    skippedDates: Array.isArray(data.skippedDates)
      ? (data.skippedDates as unknown[]).filter(
          (d): d is string => typeof d === "string",
        )
      : undefined,
    seedSource:
      typeof data.seedSource === "string" ? data.seedSource : undefined,
    deleted: data.deleted === true,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

function projectHabitTemplateRow(
  id: string,
  data: Record<string, unknown>,
): HabitTemplateRow {
  return {
    id,
    scope: data.scope === "trainer" ? "trainer" : "global",
    trainerId: typeof data.trainerId === "string" ? data.trainerId : null,
    type: (data.type as HabitType) ?? "binary",
    name: (data.name as { en: string; es: string }) ?? { en: "", es: "" },
    description: data.description as { en: string; es: string } | undefined,
    photoUrl: typeof data.photoUrl === "string" ? data.photoUrl : undefined,
    youtubeUrl:
      typeof data.youtubeUrl === "string" ? data.youtubeUrl : undefined,
    reminderTime:
      typeof data.reminderTime === "string" ? data.reminderTime : undefined,
    reminderEnabled: data.reminderEnabled === true,
    reminderCadence:
      data.reminderCadence === "daily" ||
      data.reminderCadence === "weekly" ||
      data.reminderCadence === "monthly"
        ? data.reminderCadence
        : undefined,
    reminderWeekdays: Array.isArray(data.reminderWeekdays)
      ? (data.reminderWeekdays as number[])
      : undefined,
    reminderDayOfMonth:
      typeof data.reminderDayOfMonth === "number"
        ? data.reminderDayOfMonth
        : undefined,
    reminderMonthDays: Array.isArray(data.reminderMonthDays)
      ? (data.reminderMonthDays as number[])
      : typeof data.reminderDayOfMonth === "number"
        ? [data.reminderDayOfMonth]
        : undefined,
    scheduleType:
      data.scheduleType === "one-time" ? "one-time" : "recurring",
    startsOn:
      normalizeStartsOn(data.startsOn),
    endsOn:
      normalizeEndsOn(data.endsOn),
    scheduleCadence:
      data.scheduleCadence === "daily" ||
      data.scheduleCadence === "weekly" ||
      data.scheduleCadence === "monthly"
        ? data.scheduleCadence
        : undefined,
    scheduleWeekdays: Array.isArray(data.scheduleWeekdays)
      ? (data.scheduleWeekdays as number[])
      : undefined,
    scheduleDayOfMonth:
      typeof data.scheduleDayOfMonth === "number"
        ? data.scheduleDayOfMonth
        : undefined,
    scheduleMonthDays: Array.isArray(data.scheduleMonthDays)
      ? (data.scheduleMonthDays as number[])
      : typeof data.scheduleDayOfMonth === "number"
        ? [data.scheduleDayOfMonth]
        : undefined,
    deleted: data.deleted === true,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

async function assertTrainerOwnsClient(
  trainerId: string,
  clientId: string,
): Promise<void> {
  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .doc(clientId)
    .get();
  if (!snap.exists || snap.get("coachId") !== trainerId) {
    throw new Error("Client is not in your roster.");
  }
}

async function ensureGlobalHabitTemplates(): Promise<void> {
  const db = gcFitnessFirestore();
  const refs = GLOBAL_HABIT_TEMPLATES.map((template) =>
    db.collection(TEMPLATE_COLLECTION).doc(template.id),
  );
  const snaps = await db.getAll(...refs);
  const batch = db.batch();
  let wrote = false;
  snaps.forEach((snap, index) => {
    if (snap.exists) return;
    const template = GLOBAL_HABIT_TEMPLATES[index];
    batch.set(snap.ref, {
      ...template,
      id: template.id,
      scope: "global",
      trainerId: null,
      deleted: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    wrote = true;
  });
  if (wrote) await batch.commit();
}

/**
 * Creates a NEW trainer-owned habit assigned to a specific client.
 *
 * Server-side guarantees:
 *   - `trainerId` ALWAYS set from `getCurrentTrainer().uid` — T-06-05-01.
 *   - `deleted` defaults to false.
 *   - `createdAt` / `updatedAt` are server timestamps.
 *   - Doc id follows the canonical `hab-${trainerUid}-${uuid}` scheme.
 *
 * Zod-parses BEFORE any Firestore write so malformed reminderTime, etc. are
 * caught client-of-DB.
 */
export async function createHabit(
  input: unknown,
): Promise<{ id: string }> {
  const trainer = await getCurrentTrainer();

  // Zod-parse FIRST. Unknown keys (trainerId / seedSource / deleted / etc.)
  // are stripped silently — the schema's surface is what we trust. We add
  // trainerId from the session AFTER the parse so a tampered input cannot
  // surface even if a future schema rev accidentally accepts the field.
  const data = habitCreateSchema.parse(input);

  const db = gcFitnessFirestore();
  const docId = `hab-${trainer.uid}-${randomUUID()}`;
  const docRef = db.collection(COLLECTION).doc(docId);

  const reminderDayOfMonth =
    data.reminderDayOfMonth ??
    (Array.isArray(data.reminderMonthDays) && data.reminderMonthDays.length > 0
      ? data.reminderMonthDays[0]
      : undefined);
  const scheduleDayOfMonth =
    data.scheduleDayOfMonth ??
    (Array.isArray(data.scheduleMonthDays) && data.scheduleMonthDays.length > 0
      ? data.scheduleMonthDays[0]
      : undefined);

  // Reusability (BO habit "Crear nuevo"): a habit authored from scratch ALSO
  // gets saved as a reusable trainer template so it shows up under "Asignar
  // existente" for OTHER clients. A habit assigned FROM an existing template
  // already carries `sourceTemplateId` and must NOT spawn a duplicate template.
  const existingSourceTemplateId =
    typeof data.sourceTemplateId === "string" && data.sourceTemplateId.length > 0
      ? data.sourceTemplateId
      : undefined;
  const newTemplateId = existingSourceTemplateId
    ? undefined
    : `habit-template-${trainer.uid}-${randomUUID()}`;
  const sourceTemplateId = existingSourceTemplateId ?? newTemplateId;

  await docRef.set(withoutUndefined({
    ...data,
    reminderDayOfMonth,
    scheduleDayOfMonth,
    startsOn: normalizeStartsOn(data.startsOn),
    sourceTemplateId, // links the assignment to its (existing or new) template
    id: docId,
    trainerId: trainer.uid, // T-06-05-01: ALWAYS from session, NEVER from input.
    deleted: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }));

  // Persist the reusable template (content only — strip per-assignment fields:
  // clientId, startsOn, and the sourceTemplateId back-link itself).
  if (newTemplateId) {
    const templatePayload: Record<string, unknown> = {
      ...data,
      reminderDayOfMonth,
      scheduleDayOfMonth,
      id: newTemplateId,
      scope: "trainer",
      trainerId: trainer.uid,
      deleted: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    delete templatePayload.clientId;
    delete templatePayload.startsOn;
    delete templatePayload.sourceTemplateId;
    await db
      .collection(TEMPLATE_COLLECTION)
      .doc(newTemplateId)
      .set(withoutUndefined(templatePayload));
  }

  if (typeof data.photoUrl === "string" && data.photoUrl.length > 0) {
    const rehomedPhotoUrl = await rehomeDraftHabitPhotoIfNeeded({
      finalHabitId: docId,
      trainerUid: trainer.uid,
      photoUrl: data.photoUrl,
    });
    if (rehomedPhotoUrl) {
      await docRef.update({
        photoUrl: rehomedPhotoUrl,
        updatedAt: FieldValue.serverTimestamp(),
      });
      // Keep the just-created template's photo in sync with the rehomed URL.
      if (newTemplateId) {
        await db
          .collection(TEMPLATE_COLLECTION)
          .doc(newTemplateId)
          .update({
            photoUrl: rehomedPhotoUrl,
            updatedAt: FieldValue.serverTimestamp(),
          });
      }
    }
  }

  await recordCoachActivityEvent(
    db,
    habitAssignedEvent({
      trainerId: trainer.uid,
      habitId: docId,
      name: data.name,
      clientId: typeof data.clientId === "string" ? data.clientId : null,
      pendingEmail: null,
    }),
  );

  return { id: docId };
}

// ─────────────────────────────────────────────────────────────────────────────
// P22-04 (MIRROR-04) — createPendingHabit
// Trainer creates a habit for a PENDING client. The doc carries pendingEmail
// in lieu of clientId. On the client's first sign-in, convertMirrorToCanonical
// rewrites clientId + drops pendingEmail atomically.
// ─────────────────────────────────────────────────────────────────────────────

export async function createPendingHabit(
  pendingEmail: string,
  input: unknown,
): Promise<{ id: string }> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const normalizedPendingEmail = normalizeMirrorEmail(pendingEmail);

  // Server-side ownership check on the mirror.
  const mirrorSnap = await db
    .collection(FirestoreCollections.userMirror)
    .doc(normalizedPendingEmail)
    .get();
  if (!mirrorSnap.exists) throw new Error("Pending client not found.");
  const mirror = mirrorSnap.data() as { coachId?: string; pre_created?: boolean };
  if (mirror.coachId !== trainer.uid) throw new Error("Not your pending client.");
  if (mirror.pre_created !== true) throw new Error("Mirror not marked pre_created.");

  // Reuse the same Zod schema as createHabit — but strip clientId since the
  // pending-variant uses pendingEmail instead. The schema requires clientId,
  // so we inject a placeholder before parse + drop it on the way out.
  const dataWithPlaceholderClient = {
    ...(input as Record<string, unknown>),
    clientId: `pending:${normalizedPendingEmail}`, // discarded below — only needed for schema parse
  };
  const data = habitCreateSchema.parse(dataWithPlaceholderClient);

  const docId = `hab-pending-${normalizedPendingEmail}-${randomUUID()}`;
  const docRef = db.collection(COLLECTION).doc(docId);

  await docRef.set(withoutUndefined({
    ...data,
    clientId: null,
    pendingEmail: normalizedPendingEmail,
    reminderDayOfMonth:
      data.reminderDayOfMonth ??
      (Array.isArray(data.reminderMonthDays) && data.reminderMonthDays.length > 0
        ? data.reminderMonthDays[0]
        : undefined),
    scheduleDayOfMonth:
      data.scheduleDayOfMonth ??
      (Array.isArray(data.scheduleMonthDays) && data.scheduleMonthDays.length > 0
        ? data.scheduleMonthDays[0]
        : undefined),
    startsOn: normalizeStartsOn(data.startsOn),
    id: docId,
    trainerId: trainer.uid,
    deleted: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }));

  await recordCoachActivityEvent(
    db,
    habitAssignedEvent({
      trainerId: trainer.uid,
      habitId: docId,
      name: data.name,
      clientId: null,
      pendingEmail: normalizedPendingEmail,
    }),
  );

  return { id: docId };
}

/**
 * P22-04 — list pre-loaded habits for a pending client.
 */
export async function listPendingHabits(pendingEmail: string): Promise<Array<{
  id: string;
  name: string;
  type: string;
  scheduleType: "one-time" | "recurring";
  scheduleCadence: "daily" | "weekly" | "monthly" | null;
  scheduleWeekdays: number[];
  scheduleMonthDays: number[];
}>> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const normalizedPendingEmail = normalizeMirrorEmail(pendingEmail);
  const snap = await db
    .collection(COLLECTION)
    .where("trainerId", "==", trainer.uid)
    .where("pendingEmail", "==", normalizedPendingEmail)
    .get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    if (data.deleted === true) return null;
    const rawName = data.name;
    const name =
      typeof rawName === "string"
        ? rawName
        : (rawName as { es?: string; en?: string } | undefined)?.es ?? "(unnamed)";
    return {
      id: doc.id,
      name,
      type: typeof data.type === "string" ? data.type : "binary",
      scheduleType: data.scheduleType === "one-time" ? "one-time" : "recurring",
      scheduleCadence:
        data.scheduleCadence === "weekly" || data.scheduleCadence === "monthly"
          ? data.scheduleCadence
          : data.scheduleCadence === "daily"
            ? "daily"
            : null,
      scheduleWeekdays: Array.isArray(data.scheduleWeekdays)
        ? (data.scheduleWeekdays as number[]).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
        : [],
      scheduleMonthDays: Array.isArray(data.scheduleMonthDays)
        ? (data.scheduleMonthDays as number[]).filter((d) => Number.isInteger(d) && d >= 1 && d <= 31)
        : typeof data.scheduleDayOfMonth === "number" &&
            Number.isInteger(data.scheduleDayOfMonth) &&
            data.scheduleDayOfMonth >= 1 &&
            data.scheduleDayOfMonth <= 31
          ? [data.scheduleDayOfMonth]
          : [],
    };
  }).filter((row): row is {
    id: string;
    name: string;
    type: string;
    scheduleType: "one-time" | "recurring";
    scheduleCadence: "daily" | "weekly" | "monthly" | null;
    scheduleWeekdays: number[];
    scheduleMonthDays: number[];
  } => row !== null);
}

/**
 * Updates an existing trainer-owned habit.
 *
 * Pre-flight reads the existing doc and refuses if:
 *  - the doc doesn't exist (throws "Not found")
 *  - the doc's `trainerId` isn't the caller (throws "Not your habit" —
 *    T-06-05-02 defense in depth before the rule layer)
 *
 * Parses against `habitUpdateSchemaForType(existingType)` so the
 * reminderEnabled⇒reminderTime refinement applies on update even though the
 * immutable `type` field is stripped from the input.
 *
 * The patch is built field-by-field from a whitelist matching the
 * affectedKeys list in P06-03 rules — clientId, trainerId, type,
 * createdAt, seedSource are NEVER in the patch.
 */
export async function updateHabit(
  id: string,
  input: unknown,
): Promise<{ ok: true }> {
  const trainer = await getCurrentTrainer();

  const db = gcFitnessFirestore();
  const docRef = db.collection(COLLECTION).doc(id);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new Error("Not found");
  }
  const existing = snap.data() as {
    trainerId?: string;
    type?: HabitType;
  };
  if (existing.trainerId !== trainer.uid) {
    throw new Error("Not your habit.");
  }

  const existingType: HabitType = (existing.type as HabitType) ?? "binary";
  const parsed = habitUpdateSchemaForType(existingType).parse(input) as {
    name: { en: string; es: string };
    description?: { en: string; es: string };
    photoUrl?: string;
    youtubeUrl?: string;
    reminderTime?: string;
    reminderEnabled: boolean;
    reminderCadence?: "daily" | "weekly" | "monthly";
    reminderWeekdays?: number[];
    reminderDayOfMonth?: number;
    reminderMonthDays?: number[];
    scheduleType: HabitScheduleType;
    startsOn?: string;
    endsOn?: string;
    scheduleCadence?: "daily" | "weekly" | "monthly";
    scheduleWeekdays?: number[];
    scheduleDayOfMonth?: number;
    scheduleMonthDays?: number[];
  };

  // Field-by-field whitelist (matches P06-03 affectedKeys.hasOnly([...]))
  // — no `...spread` of `parsed` because we want zero risk of an unknown
  // key surviving on update if a future Zod version starts allowing extras.
  const patch: Record<string, unknown> = {
    name: parsed.name,
    reminderEnabled: parsed.reminderEnabled,
    scheduleType: parsed.scheduleType,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (parsed.startsOn !== undefined) {
    patch.startsOn = parsed.startsOn;
  }
  if (parsed.description !== undefined) {
    patch.description = parsed.description;
  }
  if (parsed.photoUrl !== undefined) {
    patch.photoUrl = parsed.photoUrl;
  }
  if (parsed.youtubeUrl !== undefined) {
    patch.youtubeUrl = parsed.youtubeUrl;
  }
  if (parsed.reminderTime !== undefined) {
    patch.reminderTime = parsed.reminderTime;
  }
  if (parsed.reminderCadence !== undefined) {
    patch.reminderCadence = parsed.reminderCadence;
  }
  if (parsed.reminderWeekdays !== undefined) {
    patch.reminderWeekdays = parsed.reminderWeekdays;
  }
  if (parsed.reminderDayOfMonth !== undefined) {
    patch.reminderDayOfMonth = parsed.reminderDayOfMonth;
  }
  if (parsed.reminderMonthDays !== undefined) {
    patch.reminderMonthDays = parsed.reminderMonthDays;
    patch.reminderDayOfMonth =
      parsed.reminderMonthDays.length > 0 ? parsed.reminderMonthDays[0] : null;
  }
  patch.endsOn = parsed.endsOn ?? null;
  patch.scheduleCadence = parsed.scheduleCadence ?? null;
  patch.scheduleWeekdays = parsed.scheduleWeekdays ?? null;
  patch.scheduleDayOfMonth = parsed.scheduleDayOfMonth ?? null;
  patch.scheduleMonthDays = parsed.scheduleMonthDays ?? null;
  if (Array.isArray(parsed.scheduleMonthDays)) {
    patch.scheduleDayOfMonth =
      parsed.scheduleMonthDays.length > 0 ? parsed.scheduleMonthDays[0] : null;
  }

  await docRef.update(patch);

  return { ok: true };
}

/**
 * Soft-deletes a trainer-owned habit (sets `deleted: true`). Refuses on
 * cross-trainer ownership. Hard-delete is gated by Firestore rules
 * (P06-03 — `allow delete: if false`) AND by this module — T-06-05-06.
 */
export async function softDeleteHabit(
  id: string,
): Promise<{ ok: true }> {
  const trainer = await getCurrentTrainer();

  const db = gcFitnessFirestore();
  const docRef = db.collection(COLLECTION).doc(id);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new Error("Not found");
  }
  const existing = snap.data() as { trainerId?: string };
  if (existing.trainerId !== trainer.uid) {
    throw new Error("Not your habit.");
  }

  await docRef.update({
    deleted: true,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await markCoachActivityDeleted(db, `hab:${id}`);

  return { ok: true };
}

/** "YYYY-MM-DD" → the previous civil day (UTC-safe string arithmetic). */
function previousCivilDate(civilDate: string): string {
  const [y, m, d] = civilDate.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/**
 * "Delete from this day forward" — backs the schedule's habit-detail dialog
 * delete action. Soft-deleting the whole habit (`deleted: true`) wrongly hides
 * ALL of it including past occurrences/history. Instead we cap the recurrence
 * by setting `endsOn` to the day BEFORE `fromCivilDate`: the clicked day and
 * everything after stop showing, while past occurrences + logs stay intact.
 * `endsOn` is an INCLUSIVE upper bound in the schedule visibility predicate
 * (`isHabitScheduledOn`), hence the −1 day.
 *
 * If the cutoff falls before the habit's `startsOn` (deleting from at/before
 * the start), there is no past to preserve, so we fall back to a full
 * soft-delete.
 */
export async function deleteHabitRecurrenceFromDate(
  id: string,
  fromCivilDate: string,
): Promise<{ ok: true }> {
  const trainer = await getCurrentTrainer();

  const db = gcFitnessFirestore();
  const docRef = db.collection(COLLECTION).doc(id);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new Error("Not found");
  }
  const existing = snap.data() as { trainerId?: string; startsOn?: string };
  if (existing.trainerId !== trainer.uid) {
    throw new Error("Not your habit.");
  }

  const newEndsOn = previousCivilDate(fromCivilDate);

  if (existing.startsOn && newEndsOn < existing.startsOn) {
    await docRef.update({
      deleted: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true };
  }

  await docRef.update({
    endsOn: newEndsOn,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
}

/**
 * Reads a single habit by id (ownership-checked). Backs the calendar's
 * habit-detail dialog, which needs the full recurrence to render + the
 * delete affordances.
 */
export async function getHabit(id: string): Promise<HabitRow> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const snap = await db.collection(COLLECTION).doc(id).get();
  if (!snap.exists) throw new Error("Not found");
  const data = snap.data() as Record<string, unknown>;
  if (data.trainerId !== trainer.uid) throw new Error("Not your habit.");
  return projectHabitRow(snap.id, data);
}

/**
 * Mints a 60-minute v4 signed URL pinned to an image content type that the
 * HabitPhotoDropzone uses to PUT a reference photo directly to Cloud Storage.
 * Mirrors `mintExerciseThumbnailUploadUrl` (exercise-server-actions.ts) — same
 * threat coverage, habit-namespaced path:
 *
 *  - 10 MB `contentLength` cap (COST-DOS mitigation, server-side in addition
 *    to the dropzone's client gate).
 *  - `habitId` MUST start with `hab-${trainer.uid}-` so a trainer cannot mint
 *    an upload URL for another trainer's habit (PATH-TRAVERSAL mitigation).
 *    Habit doc ids are `hab-${trainerUid}-${uuid}` (see createHabit).
 *  - `contentType` MUST be one of `image/jpeg | image/png | image/webp`,
 *    pinned in the signed URL options (CONTENT-TYPE-SPOOF, server side). The
 *    browser MUST send a matching `Content-Type` header on the PUT.
 *
 * Object path: `habits/${habitId}/photo.${ext}`.
 */
export async function mintHabitPhotoUploadUrl(input: {
  habitId: string;
  contentLength: number;
  contentType: string;
}): Promise<{ url: string; gsPath: string }> {
  const trainer = await getCurrentTrainer();

  const { habitId, contentLength, contentType } = input;
  if (!habitId || typeof habitId !== "string") {
    throw new Error("BadRequest: habitId is required.");
  }
  // Path-traversal + ownership defense. The earlier prefix-only guard
  // (`hab-${uid}-*` / `habit-template-${uid}-*`) was too narrow: habits
  // assigned to PENDING clients use `hab-pending-${email}-*` and seeded habits
  // carry other id shapes, so a legitimate trainer photo upload was rejected
  // → "Photo upload failed". Instead, RESOLVE the doc and verify ownership:
  // the id must reference a /habits OR /habit_templates doc whose trainerId is
  // the caller. This both proves ownership (an attacker can't target another
  // trainer's doc) and accepts every legitimate id shape. No `..`/slash can
  // reach here because the id must match a real doc id.
  {
    const db = gcFitnessFirestore();
    const [habitSnap, templateSnap] = await Promise.all([
      db.collection(COLLECTION).doc(habitId).get(),
      db.collection(TEMPLATE_COLLECTION).doc(habitId).get(),
    ]);
    const owner =
      (habitSnap.exists &&
        (habitSnap.data() as { trainerId?: string }).trainerId) ||
      (templateSnap.exists &&
        (templateSnap.data() as { trainerId?: string }).trainerId) ||
      null;
    const isDraftTemplateId = habitId.startsWith(`habit-template-${trainer.uid}-`);
    if (owner !== trainer.uid && !isDraftTemplateId) {
      throw new Error(
        "Cannot upload to that path. habitId must reference a habit or template you own.",
      );
    }
  }
  // Cost-DoS guard.
  if (
    typeof contentLength !== "number" ||
    !Number.isFinite(contentLength) ||
    contentLength <= 0
  ) {
    throw new Error("BadRequest: contentLength must be a positive number.");
  }
  if (contentLength > MAX_HABIT_PHOTO_UPLOAD_BYTES) {
    throw new Error("File too large. The 10 MB photo ceiling was exceeded.");
  }
  // Content-type guard.
  const ext = HABIT_PHOTO_CONTENT_TYPES[contentType];
  if (!ext) {
    throw new Error(
      "BadRequest: contentType must be one of image/jpeg, image/png, image/webp.",
    );
  }

  const bucketName = getMediaBucketName();
  const bucket = gcFitnessStorage().bucket(bucketName);
  const objectPath = `habits/${habitId}/photo.${ext}`;
  const file = bucket.file(objectPath);

  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + HABIT_PHOTO_SIGNED_URL_TTL_MS,
    contentType,
  });

  return {
    url,
    gsPath: `gs://${bucketName}/${objectPath}`,
  };
}

/**
 * Removes a SINGLE occurrence of a habit by adding the civil date to the
 * habit's `skippedDates` array (idempotent via arrayUnion). The habit doc +
 * its recurrence are untouched — only that one day stops generating on the
 * trainer surfaces.
 *
 * NOTE: the iOS client must also learn to honor `skippedDates` for the day to
 * disappear from the *client's* habit list; until then this is trainer-side
 * only. Adding the optional field is backward-compatible with the existing
 * Firestore Codable decode (unknown→ignored).
 */
export async function skipHabitOccurrence(input: {
  habitId: string;
  civilDate: string;
}): Promise<{ ok: true }> {
  const trainer = await getCurrentTrainer();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.civilDate)) {
    throw new Error("Invalid civil date.");
  }
  const db = gcFitnessFirestore();
  const docRef = db.collection(COLLECTION).doc(input.habitId);
  const snap = await docRef.get();
  if (!snap.exists) throw new Error("Not found");
  const existing = snap.data() as { trainerId?: string };
  if (existing.trainerId !== trainer.uid) throw new Error("Not your habit.");

  await docRef.update({
    skippedDates: FieldValue.arrayUnion(input.civilDate),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
}

/**
 * Lists the calling trainer's habits across every client.
 *
 *  - Filters by `trainerId == session.uid` — T-06-05-05.
 *  - Excludes soft-deleted via `deleted == false` (matches P06-01 composite
 *    index #2: `trainerId+deleted+updatedAt DESC`).
 *  - Ordered by `updatedAt DESC`.
 *  - Bounded at 200 — T-06-05-07 (pagination deferred to v2).
 *
 * Returns a serializable `HabitRow[]` projection — never the raw Firestore
 * doc with Timestamps (which would break Next.js Server Action serialization).
 */
export async function listHabitsForTrainer(): Promise<HabitRow[]> {
  const trainer = await getCurrentTrainer();

  const db = gcFitnessFirestore();
  const snap = await db
    .collection(COLLECTION)
    .where("trainerId", "==", trainer.uid)
    .where("deleted", "==", false)
    .orderBy("updatedAt", "desc")
    .limit(200)
    .get();

  return snap.docs.map((d) =>
    projectHabitRow(d.id, d.data() as Record<string, unknown>),
  );
}

/**
 * Reads the calling trainer's per-trainer hidden-set of GLOBAL habit-template
 * ids (backlog B5). Doc id = trainer uid; shape `{ hiddenIds: string[] }`. One
 * read; a missing doc means nothing is hidden (returns `[]`).
 *
 * Global templates are shared + read-only across all trainers, so hiding one
 * cannot mutate the shared doc — instead the trainer records the id here and
 * `listHabitTemplates` filters it out of their Biblioteca. Trainer-scoped
 * templates are NOT affected by this set; those use the existing soft-delete.
 */
async function readHiddenGlobalTemplateIds(trainerUid: string): Promise<string[]> {
  const db = gcFitnessFirestore();
  const snap = await db
    .collection(TEMPLATE_HIDDEN_COLLECTION)
    .doc(trainerUid)
    .get();
  if (!snap.exists) return [];
  const raw = (snap.data() as { hiddenIds?: unknown }).hiddenIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string");
}

export async function listHabitTemplates(): Promise<HabitTemplateRow[]> {
  const trainer = await getCurrentTrainer();
  await ensureGlobalHabitTemplates();

  const db = gcFitnessFirestore();
  const [globalSnap, trainerSnap, hiddenIds] = await Promise.all([
    db
      .collection(TEMPLATE_COLLECTION)
      .where("scope", "==", "global")
      .orderBy("updatedAt", "desc")
      .limit(100)
      .get(),
    db
      .collection(TEMPLATE_COLLECTION)
      .where("trainerId", "==", trainer.uid)
      .orderBy("updatedAt", "desc")
      .limit(100)
      .get(),
    // 1 read for the per-trainer hidden-set (B5).
    readHiddenGlobalTemplateIds(trainer.uid),
  ]);

  const hidden = new Set(hiddenIds);

  return [...globalSnap.docs, ...trainerSnap.docs]
    .map((doc) =>
      projectHabitTemplateRow(doc.id, doc.data() as Record<string, unknown>),
    )
    .filter((row) => !row.deleted)
    // B5 — drop GLOBAL templates this trainer has hidden. Trainer-scoped rows
    // are unaffected (they soft-delete via `deleted` instead).
    .filter((row) => !(row.scope === "global" && hidden.has(row.id)));
}

/**
 * B5 — lists the ids of GLOBAL habit templates the calling trainer has hidden
 * from their own Biblioteca. Backs the "Mostrar ocultos (N)" reveal toggle, so
 * a hidden global can be restored. One read (the per-trainer hidden doc).
 */
export async function listHiddenGlobalTemplateIds(): Promise<string[]> {
  const trainer = await getCurrentTrainer();
  return readHiddenGlobalTemplateIds(trainer.uid);
}

/**
 * B5 — hides a GLOBAL habit template from the calling trainer's Biblioteca.
 *
 * Global templates are shared + read-only, so this NEVER mutates the shared
 * template doc; instead it records the id in the per-trainer hidden-set
 * `habit_template_hidden/{uid}` (arrayUnion — idempotent). Validates that the
 * target is actually a global template; trainer-scoped templates must keep
 * using `softDeleteHabitTemplate` and are rejected here.
 */
export async function hideGlobalHabitTemplate(
  templateId: string,
): Promise<{ ok: true }> {
  const trainer = await getCurrentTrainer();
  if (typeof templateId !== "string" || templateId.trim().length === 0) {
    throw new Error("BadRequest: templateId is required.");
  }

  const db = gcFitnessFirestore();
  const templateSnap = await db
    .collection(TEMPLATE_COLLECTION)
    .doc(templateId)
    .get();
  if (!templateSnap.exists) {
    throw new Error("Template not found.");
  }
  const scope = (templateSnap.data() as { scope?: string }).scope;
  if (scope !== "global") {
    // Trainer-scoped templates are soft-deleted, not hidden. Routing one here
    // would silently no-op the user's intent.
    throw new Error("Only global templates can be hidden.");
  }

  await db
    .collection(TEMPLATE_HIDDEN_COLLECTION)
    .doc(trainer.uid)
    .set(
      {
        hiddenIds: FieldValue.arrayUnion(templateId),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  return { ok: true };
}

/**
 * B5 — unhides a previously-hidden GLOBAL habit template (arrayRemove). Safe to
 * call even if the id was never hidden. No scope check needed: removing a
 * non-global id is a harmless no-op for the hidden-set.
 */
export async function unhideGlobalHabitTemplate(
  templateId: string,
): Promise<{ ok: true }> {
  const trainer = await getCurrentTrainer();
  if (typeof templateId !== "string" || templateId.trim().length === 0) {
    throw new Error("BadRequest: templateId is required.");
  }

  const db = gcFitnessFirestore();
  await db
    .collection(TEMPLATE_HIDDEN_COLLECTION)
    .doc(trainer.uid)
    .set(
      {
        hiddenIds: FieldValue.arrayRemove(templateId),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  return { ok: true };
}

/**
 * READ-ONLY impact projection for the habit-template delete confirm dialog
 * (backlog B6). Lists the live (non-deleted) per-client assignments that were
 * created from a given template — i.e. the assignment docs carrying
 * `sourceTemplateId == templateId` and owned by the calling trainer.
 *
 * This is informational ONLY: it does NOT mutate anything and is decoupled from
 * the delete behavior. Deleting the template (`softDeleteHabitTemplate`) does
 * NOT cascade to these assignments — they keep running on each client. The
 * dialog uses this list to tell the trainer truthfully who still has the habit.
 *
 * NOTE: only assignments created through the template-assignment path (which
 * stamps `sourceTemplateId`) are reached. Unlinked / hand-created habits with
 * the same name are not counted.
 */
export interface HabitTemplateAssignmentImpact {
  habitId: string;
  clientId: string | null;
  pendingEmail: string | null;
  scheduleType: HabitScheduleType;
  scheduleCadence?: "daily" | "weekly" | "monthly";
  scheduleWeekdays?: number[];
  scheduleDayOfMonth?: number;
  scheduleMonthDays?: number[];
}

export async function listHabitTemplateAssignments(
  templateId: string,
): Promise<HabitTemplateAssignmentImpact[]> {
  const trainer = await getCurrentTrainer();
  if (typeof templateId !== "string" || templateId.trim().length === 0) {
    return [];
  }

  const db = gcFitnessFirestore();
  // Single-field equality query — no composite index required (mirrors the
  // cascade query in updateHabitTemplate).
  const snap = await db
    .collection(COLLECTION)
    .where("sourceTemplateId", "==", templateId)
    .get();

  const impacts: HabitTemplateAssignmentImpact[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    // Defense-in-depth: Admin SDK bypasses rules; scope to caller + live.
    if (data.trainerId !== trainer.uid) continue;
    if (data.deleted === true) continue;
    const row = projectHabitRow(doc.id, data);
    const pendingEmail =
      typeof data.pendingEmail === "string" && data.pendingEmail.length > 0
        ? data.pendingEmail
        : null;
    // projectHabitRow synthesizes `mirror:<email>` for pending assignments;
    // only surface a real client uid here so name lookups don't get a mirror id.
    const realClientId =
      typeof data.clientId === "string" && data.clientId.trim().length > 0
        ? data.clientId.trim()
        : null;
    impacts.push({
      habitId: row.id,
      clientId: realClientId,
      pendingEmail,
      scheduleType: row.scheduleType,
      scheduleCadence: row.scheduleCadence,
      scheduleWeekdays: row.scheduleWeekdays,
      scheduleDayOfMonth: row.scheduleDayOfMonth,
      scheduleMonthDays: row.scheduleMonthDays,
    });
  }
  return impacts;
}

export async function createHabitTemplate(
  input: unknown,
): Promise<{ id: string }> {
  const trainer = await getCurrentTrainer();
  const raw = z
    .object({
      id: z.string().trim().min(1).optional(),
    })
    .passthrough()
    .parse(input);
  const parsed = habitTemplateCreateSchema.parse(raw);
  const db = gcFitnessFirestore();
  const docId =
    raw.id && raw.id.startsWith(`habit-template-${trainer.uid}-`)
      ? raw.id
      : `habit-template-${trainer.uid}-${randomUUID()}`;
  await db.collection(TEMPLATE_COLLECTION).doc(docId).set(withoutUndefined({
    ...parsed,
    reminderDayOfMonth:
      parsed.reminderDayOfMonth ??
      (Array.isArray(parsed.reminderMonthDays) && parsed.reminderMonthDays.length > 0
        ? parsed.reminderMonthDays[0]
        : undefined),
    scheduleDayOfMonth:
      parsed.scheduleDayOfMonth ??
      (Array.isArray(parsed.scheduleMonthDays) && parsed.scheduleMonthDays.length > 0
        ? parsed.scheduleMonthDays[0]
        : undefined),
    id: docId,
    scope: "trainer",
    trainerId: trainer.uid,
    deleted: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }));
  return { id: docId };
}

/**
 * Soft-deletes a trainer-owned (scope === "trainer") habit template. GLOBAL
 * templates are NOT deletable. Mirrors `softDeleteHabit`: the Firestore rules
 * forbid hard delete (`allow delete: if false`) but permit flipping `deleted`
 * via update for own trainer-scoped templates, so we set `deleted: true`.
 * `listHabitTemplates` filters `!deleted`, so the row disappears.
 */
export async function softDeleteHabitTemplate(
  id: string,
): Promise<{ ok: true }> {
  const trainer = await getCurrentTrainer();

  const db = gcFitnessFirestore();
  const docRef = db.collection(TEMPLATE_COLLECTION).doc(id);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new Error("Not found");
  }
  const existing = snap.data() as { scope?: string; trainerId?: string };
  if (existing.scope === "global") {
    throw new Error("Global templates can't be deleted.");
  }
  if (existing.trainerId !== trainer.uid) {
    throw new Error("Not your template.");
  }

  await docRef.update({
    deleted: true,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
}

/**
 * Updates the trainer-editable fields of an own (scope === "trainer") habit
 * template. GLOBAL templates are read-only. Only the intrinsic fields shown in
 * the library detail are editable (name, description, reminder);
 * `type` / `scope` / `trainerId` / recurrence are left untouched. The affected
 * keys stay within the Firestore-rules update whitelist.
 */
export async function updateHabitTemplate(
  id: string,
  input: unknown,
): Promise<{ ok: true }> {
  const trainer = await getCurrentTrainer();
  const parsed = habitTemplateUpdateSchema.parse(input);

  const db = gcFitnessFirestore();
  const docRef = db.collection(TEMPLATE_COLLECTION).doc(id);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new Error("Not found");
  }
  const existing = snap.data() as { scope?: string; trainerId?: string };
  if (existing.scope === "global") {
    throw new Error("Global templates can't be edited.");
  }
  if (existing.trainerId !== trainer.uid) {
    throw new Error("Not your template.");
  }

  await docRef.update(
    withoutUndefined({
      name: parsed.name,
      description: parsed.description,
      photoUrl: parsed.photoUrl,
      youtubeUrl: parsed.youtubeUrl,
      reminderEnabled: parsed.reminderEnabled,
      // Only persist a time when the reminder is on.
      reminderTime: parsed.reminderEnabled ? parsed.reminderTime : undefined,
      updatedAt: FieldValue.serverTimestamp(),
    }),
  );

  // Cascade the CONTENT fields (description / photo / video) onto every live
  // assignment created from this template (linked via `sourceTemplateId`). The
  // iOS app reads the per-client assignment doc, not the template — without
  // this, a library edit would never reach the client. We intentionally do NOT
  // cascade name / schedule / reminder: those are commonly customised per
  // assignment, whereas the description/photo/video are intrinsic "what is this
  // habit" context the trainer expects to edit once.
  //
  // LIMITATION: only assignments carrying `sourceTemplateId` are reached.
  // Assignments created before this link existed (or by any unlinked path) are
  // NOT updated — edit those directly from the Assignments tab.
  const contentPatch = withoutUndefined({
    description: parsed.description,
    photoUrl: parsed.photoUrl,
    youtubeUrl: parsed.youtubeUrl,
  });
  if (Object.keys(contentPatch).length > 0) {
    // Single-field equality query — no composite index required.
    const linked = await db
      .collection(COLLECTION)
      .where("sourceTemplateId", "==", id)
      .get();
    const mine = linked.docs.filter((d) => {
      const data = d.data() as { trainerId?: string; deleted?: boolean };
      return data.trainerId === trainer.uid && data.deleted !== true;
    });
    // Firestore batches cap at 500 writes; chunk defensively.
    for (let i = 0; i < mine.length; i += 450) {
      const batch = db.batch();
      for (const d of mine.slice(i, i + 450)) {
        batch.update(d.ref, {
          ...contentPatch,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }
  }

  return { ok: true };
}

export async function assignHabitTemplate(input: unknown): Promise<{
  created: number;
}> {
  const trainer = await getCurrentTrainer();
  const parsed = z
    .object({
      templateId: z.string().trim().min(1),
      clientIds: z.array(z.string().trim().min(1)).min(1).max(50),
      // Optional start-date override. When the trainer assigns from a calendar
      // cell, the habit should begin on that cell's day rather than inheriting
      // the template's own startsOn.
      startsOn: z.string().trim().min(1).optional(),
    })
    .parse(input);

  const db = gcFitnessFirestore();
  const templateSnap = await db
    .collection(TEMPLATE_COLLECTION)
    .doc(parsed.templateId)
    .get();
  if (!templateSnap.exists) throw new Error("Template not found.");
  const template = projectHabitTemplateRow(
    templateSnap.id,
    templateSnap.data() as Record<string, unknown>,
  );
  if (
    template.deleted ||
    (template.scope !== "global" && template.trainerId !== trainer.uid)
  ) {
    throw new Error("Template not available.");
  }

  for (const clientId of parsed.clientIds) {
    await assertTrainerOwnsClient(trainer.uid, clientId);
  }

  const batch = db.batch();
  const assignedHabits: Array<{ docId: string; clientId: string }> = [];
  for (const clientId of parsed.clientIds) {
    const docId = `hab-${trainer.uid}-${randomUUID()}`;
    assignedHabits.push({ docId, clientId });
    const docRef = db.collection(COLLECTION).doc(docId);
    batch.set(docRef, {
      id: docId,
      clientId,
      trainerId: trainer.uid,
      type: template.type,
      name: template.name,
      ...(template.description ? { description: template.description } : {}),
      ...(template.photoUrl ? { photoUrl: template.photoUrl } : {}),
      ...(template.youtubeUrl ? { youtubeUrl: template.youtubeUrl } : {}),
      ...(template.reminderTime ? { reminderTime: template.reminderTime } : {}),
      ...(template.reminderCadence
        ? { reminderCadence: template.reminderCadence }
        : {}),
      ...(template.reminderWeekdays
        ? { reminderWeekdays: template.reminderWeekdays }
        : {}),
      ...(template.reminderDayOfMonth !== undefined
        ? { reminderDayOfMonth: template.reminderDayOfMonth }
        : {}),
      ...(template.reminderMonthDays
        ? { reminderMonthDays: template.reminderMonthDays }
        : {}),
      scheduleType: template.scheduleType ?? "recurring",
      startsOn: parsed.startsOn ?? template.startsOn ?? todayCivilDateUTC(),
      ...(template.endsOn ? { endsOn: template.endsOn } : {}),
      ...(template.scheduleCadence
        ? { scheduleCadence: template.scheduleCadence }
        : { scheduleCadence: "daily" }),
      ...(template.scheduleWeekdays
        ? { scheduleWeekdays: template.scheduleWeekdays }
        : {}),
      ...(template.scheduleDayOfMonth !== undefined
        ? { scheduleDayOfMonth: template.scheduleDayOfMonth }
        : {}),
      ...(template.scheduleMonthDays
        ? { scheduleMonthDays: template.scheduleMonthDays }
        : {}),
      reminderEnabled: template.reminderEnabled,
      sourceTemplateId: template.id,
      deleted: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  await Promise.all(
    assignedHabits.map(({ docId, clientId }) =>
      recordCoachActivityEvent(
        db,
        habitAssignedEvent({
          trainerId: trainer.uid,
          habitId: docId,
          name: template.name,
          clientId,
          pendingEmail: null,
        }),
      ),
    ),
  );

  return { created: parsed.clientIds.length };
}

export async function assignHabitTemplateToPending(input: unknown): Promise<{
  created: number;
}> {
  const trainer = await getCurrentTrainer();
  const parsed = z
    .object({
      templateId: z.string().trim().min(1),
      pendingEmail: z.string().trim().min(1),
    })
    .parse(input);

  const db = gcFitnessFirestore();
  const normalizedPendingEmail = normalizeMirrorEmail(parsed.pendingEmail);
  const mirrorSnap = await db
    .collection(FirestoreCollections.userMirror)
    .doc(normalizedPendingEmail)
    .get();
  if (!mirrorSnap.exists) throw new Error("Pending client not found.");
  const mirror = mirrorSnap.data() as { coachId?: string; pre_created?: boolean };
  if (mirror.coachId !== trainer.uid) throw new Error("Not your pending client.");
  if (mirror.pre_created !== true) throw new Error("Mirror not marked pre_created.");

  const templateSnap = await db
    .collection(TEMPLATE_COLLECTION)
    .doc(parsed.templateId)
    .get();
  if (!templateSnap.exists) throw new Error("Template not found.");
  const template = projectHabitTemplateRow(
    templateSnap.id,
    templateSnap.data() as Record<string, unknown>,
  );
  if (
    template.deleted ||
    (template.scope !== "global" && template.trainerId !== trainer.uid)
  ) {
    throw new Error("Template not available.");
  }

  const docId = `hab-pending-${normalizedPendingEmail}-${randomUUID()}`;
  await db.collection(COLLECTION).doc(docId).set(withoutUndefined({
    id: docId,
    clientId: null,
    pendingEmail: normalizedPendingEmail,
    trainerId: trainer.uid,
    type: template.type,
    name: template.name,
    ...(template.description ? { description: template.description } : {}),
    ...(template.photoUrl ? { photoUrl: template.photoUrl } : {}),
    ...(template.youtubeUrl ? { youtubeUrl: template.youtubeUrl } : {}),
    ...(template.reminderTime ? { reminderTime: template.reminderTime } : {}),
    ...(template.reminderCadence
      ? { reminderCadence: template.reminderCadence }
      : {}),
    ...(template.reminderWeekdays
      ? { reminderWeekdays: template.reminderWeekdays }
      : {}),
    ...(template.reminderDayOfMonth !== undefined
      ? { reminderDayOfMonth: template.reminderDayOfMonth }
      : {}),
    ...(template.reminderMonthDays
      ? { reminderMonthDays: template.reminderMonthDays }
      : {}),
    scheduleType: template.scheduleType ?? "recurring",
    startsOn: template.startsOn ?? todayCivilDateUTC(),
    ...(template.endsOn ? { endsOn: template.endsOn } : {}),
    ...(template.scheduleCadence
      ? { scheduleCadence: template.scheduleCadence }
      : { scheduleCadence: "daily" }),
    ...(template.scheduleWeekdays
      ? { scheduleWeekdays: template.scheduleWeekdays }
      : {}),
    ...(template.scheduleDayOfMonth !== undefined
      ? { scheduleDayOfMonth: template.scheduleDayOfMonth }
      : {}),
    ...(template.scheduleMonthDays
      ? { scheduleMonthDays: template.scheduleMonthDays }
      : {}),
    reminderEnabled: template.reminderEnabled,
    sourceTemplateId: template.id,
    deleted: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }));

  await recordCoachActivityEvent(
    db,
    habitAssignedEvent({
      trainerId: trainer.uid,
      habitId: docId,
      name: template.name,
      clientId: null,
      pendingEmail: normalizedPendingEmail,
    }),
  );

  return { created: 1 };
}

/**
 * Lists habits assigned to a single client by the calling trainer.
 *
 * Implementation note (Plan-Task 2 choice (b)): the query scopes by
 * `clientId + deleted` and lets the rule layer (P06-03) enforce the
 * `trainerId == auth.uid` precondition on read. Rationale:
 *   - A 4-field composite index would otherwise be required
 *     (`clientId+trainerId+deleted+updatedAt DESC`); not declared in
 *     `firestore.indexes.json` from P06-01.
 *   - The rule layer is sufficient: any returned doc must already satisfy
 *     `trainerId == auth.uid OR clientId == auth.uid`. Since this Server
 *     Action is invoked by an authed trainer (getCurrentTrainer guard),
 *     a doc owned by a different trainer would surface as a
 *     PERMISSION_DENIED on Firestore-rule evaluation — except that the
 *     Admin SDK bypasses rules, so we re-enforce here at the application
 *     layer via the post-query filter.
 *
 * Defense-in-depth: we additionally filter the result client-of-DB to
 * `row.trainerId === session.uid` so a misbehaving rule (or a future rule
 * relaxation) cannot leak cross-trainer habits.
 *
 *  - Bounded at 200 — T-06-05-07.
 *  - Excludes soft-deleted.
 */
export async function listHabitsForClient(
  clientId: string,
): Promise<HabitRow[]> {
  const trainer = await getCurrentTrainer();

  const db = gcFitnessFirestore();
  const snap = await db
    .collection(COLLECTION)
    .where("clientId", "==", clientId)
    .where("deleted", "==", false)
    .orderBy("updatedAt", "desc")
    .limit(200)
    .get();

  const rows = snap.docs.map((d) =>
    projectHabitRow(d.id, d.data() as Record<string, unknown>),
  );
  // Defense-in-depth: Admin SDK bypasses rules; re-check ownership here.
  return rows.filter((r) => r.trainerId === trainer.uid);
}
