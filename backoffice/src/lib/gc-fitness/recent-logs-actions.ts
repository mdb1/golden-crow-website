"use server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { FirestoreCollections } from "./collections";
import { listClients } from "./client-roster";

export type RecentLogCategory = "habit" | "workout";

export interface RecentLogRow {
  id: string;
  category: RecentLogCategory;
  eventAt: string;
  clientId: string;
  clientName: string;
  title: string;
  detail: string;
  workoutLogId: string | null;
}

export interface WorkoutLogDetail {
  id: string;
  clientId: string;
  clientName: string;
  workoutName: string;
  startedAt: string | null;
  completedAt: string | null;
  status: "completed" | "started";
  setCount: number;
  completedSetCount: number;
  exerciseCount: number;
  sets: Array<{
    index: number;
    exerciseName: string;
    reps: number | null;
    weight: number | null;
    completedAt: string | null;
  }>;
}

function asDate(value: unknown): Date | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function asIso(value: unknown): string | null {
  return asDate(value)?.toISOString() ?? null;
}

function localizedText(value: unknown, fallback = "Untitled"): string {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") {
    const localized = value as { en?: unknown; es?: unknown };
    if (typeof localized.en === "string" && localized.en.trim()) return localized.en;
    if (typeof localized.es === "string" && localized.es.trim()) return localized.es;
  }
  return fallback;
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function boolCompleted(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (!v) return false;
    return v !== "0" && v !== "false" && v !== "pending";
  }
  return false;
}

function isoOrEpoch(iso: string | null): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export async function listRecentLogsForTrainer(): Promise<{
  logs: RecentLogRow[];
  clients: Array<{ id: string; name: string }>;
}> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  const clients = await listClients();
  const nameByClientId = new Map(clients.map((c) => [c.uid, c.displayName]));
  const clientList = clients.map((c) => ({ id: c.uid, name: c.displayName }));

  const workoutLogsPromise = db
    .collection(FirestoreCollections.workoutLogs)
    .where("trainerId", "==", trainer.uid)
    .limit(600)
    .get();

  // Some historical habit logs are missing/incorrect `coachId`.
  // Query per roster client instead of filtering by coachId so we include
  // those legacy rows.
  const habitLogPromises = clients.map((client) =>
    db
      .collection(FirestoreCollections.habitLogs)
      .where("clientId", "==", client.uid)
      .limit(200)
      .get(),
  );

  const [workoutLogsSnap, ...habitLogsSnaps] = await Promise.all([
    workoutLogsPromise,
    ...habitLogPromises,
  ]);

  const habitLogDocs = habitLogsSnaps.flatMap((snap) => snap.docs);

  const habitLogsById = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const doc of habitLogDocs) {
    habitLogsById.set(doc.id, doc);
  }
  const habitLogs = Array.from(habitLogsById.values());

  const habitIds = new Set<string>();
  habitLogs.forEach((doc) => {
    const habitId = doc.get("habitId");
    if (typeof habitId === "string" && habitId.length > 0) {
      habitIds.add(habitId);
    }
  });

  const habitNames = new Map<string, string>();
  if (habitIds.size > 0) {
    const refs = Array.from(habitIds).map((id) =>
      db.collection(FirestoreCollections.habits).doc(id),
    );
    const docs = await db.getAll(...refs);
    docs.forEach((doc) => {
      if (!doc.exists) return;
      habitNames.set(doc.id, localizedText(doc.get("name"), "Habit"));
    });
  }

  const rows: RecentLogRow[] = [];

  workoutLogsSnap.docs.forEach((doc) => {
    const data = doc.data();
    const clientId = typeof data.clientId === "string" ? data.clientId : "";
    if (!clientId || !nameByClientId.has(clientId)) return;

    const startedAt =
      asIso(data.startedAt) ??
      asIso(data.createdAt) ??
      asIso(data.updatedAt);
    if (!startedAt) return;

    const completedAt = asIso(data.completedAt);
    const status: "completed" | "started" = completedAt ? "completed" : "started";
    const templateName = localizedText(
      (data.templateSnapshot as { name?: unknown } | undefined)?.name,
      "Workout",
    );
    const sets = Array.isArray(data.sets) ? data.sets.length : 0;

    rows.push({
      id: `workout:${doc.id}`,
      category: "workout",
      eventAt: completedAt ?? startedAt,
      clientId,
      clientName: nameByClientId.get(clientId) ?? clientId,
      title:
        status === "completed"
          ? `${nameByClientId.get(clientId) ?? clientId} - Workout completed: ${templateName}`
          : `${nameByClientId.get(clientId) ?? clientId} - Workout started: ${templateName}`,
      detail: `${templateName} · ${sets} sets`,
      workoutLogId: doc.id,
    });
  });

  habitLogs.forEach((doc) => {
    const data = doc.data();
    const clientId = typeof data.clientId === "string" ? data.clientId : "";
    if (!clientId || !nameByClientId.has(clientId)) return;

    const eventAt =
      asIso(data.loggedAt) ??
      asIso(data.updatedAt) ??
      asIso(data.createdAt);
    if (!eventAt) return;

    const habitId = typeof data.habitId === "string" ? data.habitId : "";
    const habitName = habitNames.get(habitId) ?? "Habit";
    const completed = boolCompleted(data.value) && data.deleted !== true;

    rows.push({
      id: `habit:${doc.id}`,
      category: "habit",
      eventAt,
      clientId,
      clientName: nameByClientId.get(clientId) ?? clientId,
      title: completed
        ? `${nameByClientId.get(clientId) ?? clientId} - Habit done: ${habitName}`
        : `${nameByClientId.get(clientId) ?? clientId} - Habit updated: ${habitName}`,
      detail: completed ? "Completed" : "Pending update",
      workoutLogId: null,
    });
  });

  rows.sort((a, b) => isoOrEpoch(b.eventAt) - isoOrEpoch(a.eventAt));

  return {
    logs: rows,
    clients: clientList,
  };
}

export async function getWorkoutLogDetail(
  workoutLogId: string,
): Promise<WorkoutLogDetail> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  const logSnap = await db
    .collection(FirestoreCollections.workoutLogs)
    .doc(workoutLogId)
    .get();
  if (!logSnap.exists) {
    throw new Error("Workout log not found.");
  }

  const data = logSnap.data() as Record<string, unknown>;
  if (data.trainerId !== trainer.uid) {
    throw new Error("Forbidden");
  }

  const clientId = typeof data.clientId === "string" ? data.clientId : "";
  if (!clientId) {
    throw new Error("Workout log missing client.");
  }

  const clientSnap = await db.collection(FirestoreCollections.users).doc(clientId).get();
  const clientData = clientSnap.data() as { displayName?: string } | undefined;
  const clientName = clientData?.displayName ?? clientId;

  const workoutName = localizedText(
    (data.templateSnapshot as { name?: unknown } | undefined)?.name,
    "Workout",
  );
  const startedAt = asIso(data.startedAt);
  const completedAt = asIso(data.completedAt);

  const rawSets = Array.isArray(data.sets)
    ? (data.sets as Array<Record<string, unknown>>)
    : [];
  const templateExercises =
    (data.templateSnapshot as { exercises?: Array<Record<string, unknown>> } | undefined)
      ?.exercises ?? [];

  const sets = rawSets.map((set, index) => {
    const exerciseIndex = numeric(set.exerciseIndex);
    const templateExercise =
      exerciseIndex !== null &&
      exerciseIndex >= 0 &&
      exerciseIndex < templateExercises.length
        ? templateExercises[exerciseIndex]
        : undefined;
    const exerciseName = localizedText(templateExercise?.name, `Exercise ${index + 1}`);
    return {
      index: index + 1,
      exerciseName,
      reps: numeric(set.reps),
      weight: numeric(set.weight),
      completedAt: asIso(set.completedAt),
    };
  });

  return {
    id: logSnap.id,
    clientId,
    clientName,
    workoutName,
    startedAt,
    completedAt,
    status: completedAt ? "completed" : "started",
    setCount: sets.length,
    completedSetCount: sets.filter((s) => Boolean(s.completedAt)).length,
    exerciseCount: templateExercises.length,
    sets,
  };
}
