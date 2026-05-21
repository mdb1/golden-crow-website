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
//   T-06-05-03 (Tampering — multi-choice without options)
//     → Zod superRefine in habit-schema.ts fails on parse.
//   T-06-05-04 (Tampering — weight habit with targetValue)
//     → Zod superRefine fails on parse.
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

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import {
  habitCreateSchema,
  habitTemplateCreateSchema,
  habitUpdateSchemaForType,
  type HabitType,
  type HabitScheduleType,
} from "./habit-schema";
import { getCurrentTrainer } from "./auth-helpers";
import { FirestoreCollections } from "./collections";

const COLLECTION = FirestoreCollections.habits;
const TEMPLATE_COLLECTION = FirestoreCollections.habitTemplates;

const GLOBAL_HABIT_TEMPLATES = [
  {
    id: "global-water",
    type: "numeric",
    name: { en: "Water intake", es: "Agua diaria" },
    description: {
      en: "Hit your daily hydration target.",
      es: "Cumple tu objetivo diario de hidratacion.",
    },
    targetValue: 2,
    unit: "L",
    reminderEnabled: false,
  },
  {
    id: "global-sleep",
    type: "numeric",
    name: { en: "Sleep", es: "Sueno" },
    description: {
      en: "Track total hours slept.",
      es: "Registra tus horas totales de sueno.",
    },
    targetValue: 7,
    unit: "h",
    reminderEnabled: false,
  },
  {
    id: "global-steps",
    type: "numeric",
    name: { en: "Steps", es: "Pasos" },
    targetValue: 8000,
    unit: "steps",
    reminderEnabled: false,
  },
  {
    id: "global-protein",
    type: "numeric",
    name: { en: "Protein", es: "Proteina" },
    targetValue: 120,
    unit: "g",
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
  {
    id: "global-energy",
    type: "multi-choice",
    name: { en: "Energy check", es: "Chequeo de energia" },
    options: ["High", "OK", "Low"],
    reminderEnabled: false,
  },
] satisfies Array<{
  id: string;
  type: HabitType;
  name: { en: string; es: string };
  description?: { en: string; es: string };
  options?: string[];
  targetValue?: number;
  unit?: string;
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
  options?: string[];
  targetValue?: number;
  unit?: string;
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
  options?: string[];
  targetValue?: number;
  unit?: string;
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

function normalizeStartsOn(v: unknown): string {
  return typeof v === "string" && v.length > 0 ? v : todayCivilDateUTC();
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
  return {
    id,
    clientId: (data.clientId as string) ?? "",
    trainerId: (data.trainerId as string) ?? "",
    type: (data.type as HabitType) ?? "binary",
    name: (data.name as { en: string; es: string }) ?? { en: "", es: "" },
    description: data.description as { en: string; es: string } | undefined,
    options: Array.isArray(data.options)
      ? (data.options as string[])
      : undefined,
    targetValue:
      typeof data.targetValue === "number" ? data.targetValue : undefined,
    unit: typeof data.unit === "string" ? data.unit : undefined,
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
      typeof data.endsOn === "string" ? data.endsOn : undefined,
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
    options: Array.isArray(data.options)
      ? (data.options as string[])
      : undefined,
    targetValue:
      typeof data.targetValue === "number" ? data.targetValue : undefined,
    unit: typeof data.unit === "string" ? data.unit : undefined,
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
      typeof data.endsOn === "string" ? data.endsOn : undefined,
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
 * Zod-parses BEFORE any Firestore write so multi-choice-without-options,
 * weight-with-targetValue, malformed reminderTime, etc. are caught
 * client-of-DB — T-06-05-03 / -04.
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

  await docRef.set(withoutUndefined({
    ...data,
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
    trainerId: trainer.uid, // T-06-05-01: ALWAYS from session, NEVER from input.
    deleted: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }));

  return { id: docId };
}

/**
 * Updates an existing trainer-owned habit.
 *
 * Pre-flight reads the existing doc and refuses if:
 *  - the doc doesn't exist (throws "Not found")
 *  - the doc's `trainerId` isn't the caller (throws "Not your habit" —
 *    T-06-05-02 defense in depth before the rule layer)
 *
 * Parses against `habitUpdateSchemaForType(existingType)` so the same
 * type-conditional refinements (multi-choice⇒options, weight⇒no targetValue,
 * reminderEnabled⇒reminderTime) apply on update even though the immutable
 * `type` field is stripped from the input.
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
    options?: string[];
    targetValue?: number;
    unit?: string;
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
  if (parsed.options !== undefined) {
    patch.options = parsed.options;
  }
  if (parsed.targetValue !== undefined) {
    patch.targetValue = parsed.targetValue;
  }
  if (parsed.unit !== undefined) {
    patch.unit = parsed.unit;
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

export async function listHabitTemplates(): Promise<HabitTemplateRow[]> {
  const trainer = await getCurrentTrainer();
  await ensureGlobalHabitTemplates();

  const db = gcFitnessFirestore();
  const [globalSnap, trainerSnap] = await Promise.all([
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
  ]);

  return [...globalSnap.docs, ...trainerSnap.docs]
    .map((doc) =>
      projectHabitTemplateRow(doc.id, doc.data() as Record<string, unknown>),
    )
    .filter((row) => !row.deleted);
}

export async function createHabitTemplate(
  input: unknown,
): Promise<{ id: string }> {
  const trainer = await getCurrentTrainer();
  const parsed = habitTemplateCreateSchema.parse(input);
  const db = gcFitnessFirestore();
  const docId = `habit-template-${trainer.uid}-${randomUUID()}`;
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

export async function assignHabitTemplate(input: unknown): Promise<{
  created: number;
}> {
  const trainer = await getCurrentTrainer();
  const parsed = z
    .object({
      templateId: z.string().trim().min(1),
      clientIds: z.array(z.string().trim().min(1)).min(1).max(50),
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
  for (const clientId of parsed.clientIds) {
    const docId = `hab-${trainer.uid}-${randomUUID()}`;
    const docRef = db.collection(COLLECTION).doc(docId);
    batch.set(docRef, {
      id: docId,
      clientId,
      trainerId: trainer.uid,
      type: template.type,
      name: template.name,
      ...(template.description ? { description: template.description } : {}),
      ...(template.options ? { options: template.options } : {}),
      ...(template.targetValue !== undefined
        ? { targetValue: template.targetValue }
        : {}),
      ...(template.unit ? { unit: template.unit } : {}),
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
    });
  }
  await batch.commit();

  return { created: parsed.clientIds.length };
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
