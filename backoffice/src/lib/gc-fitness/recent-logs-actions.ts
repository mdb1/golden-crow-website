"use server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { FirestoreCollections } from "./collections";
import { listClients } from "./client-roster";

export type RecentLogCategory = "habit" | "workout" | "chat" | "photo" | "weight";

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
  if (value && typeof value === "object") {
    const maybe = value as {
      _seconds?: unknown;
      _nanoseconds?: unknown;
      seconds?: unknown;
      nanoseconds?: unknown;
    };
    const rawSeconds =
      typeof maybe._seconds === "number"
        ? maybe._seconds
        : typeof maybe.seconds === "number"
          ? maybe.seconds
          : null;
    const rawNanos =
      typeof maybe._nanoseconds === "number"
        ? maybe._nanoseconds
        : typeof maybe.nanoseconds === "number"
          ? maybe.nanoseconds
          : 0;
    if (rawSeconds !== null) {
      const millis = rawSeconds * 1000 + Math.floor(rawNanos / 1_000_000);
      const d = new Date(millis);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    // Normalize both epoch-millis and epoch-seconds payloads.
    const normalized = value < 1_000_000_000_000 ? value * 1000 : value;
    const d = new Date(normalized);
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

  // 260524 — Phase 20 extension: also surface chat messages from the
  // client, progress-photo uploads, and body-weight logs. Each is a
  // separate per-client fan-out (no top-level "coachId" indexed query
  // for these collections).
  const chatPromises = clients.map((client) =>
    db
      .collection(FirestoreCollections.chats)
      .doc(client.uid)
      .collection(FirestoreCollections.messages)
      .where("senderId", "==", client.uid) // ONLY client-authored (skip trainer's own)
      .orderBy("createdAt", "desc")
      .limit(20)
      .get()
      .catch(() => null),
  );
  const photoPromises = clients.map((client) =>
    db
      .collection(FirestoreCollections.progressPhotos)
      .where("clientId", "==", client.uid)
      .orderBy("createdAt", "desc")
      .limit(20)
      .get()
      .catch(() => null),
  );
  const weightPromises = clients.map((client) =>
    db
      .collection(FirestoreCollections.users)
      .doc(client.uid)
      .collection("body_weight_logs")
      .orderBy("recordedAt", "desc")
      .limit(20)
      .get()
      .catch(() => null),
  );

  const [
    workoutLogsSnap,
    habitLogsSnaps,
    chatSnaps,
    photoSnaps,
    weightSnaps,
  ] = await Promise.all([
    workoutLogsPromise,
    Promise.all(habitLogPromises),
    Promise.all(chatPromises),
    Promise.all(photoPromises),
    Promise.all(weightPromises),
  ]);

  // Rewrap as a flat array so the rest of the function (which expects
  // a single habitLogsSnaps[] flatten step) is unchanged.
  const _legacyHabitsSnapsRest = habitLogsSnaps;

  const habitLogDocs = _legacyHabitsSnapsRest.flatMap((snap) => snap.docs);

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

    // 260522-ook — skip soft-deleted habit logs. The iOS surface's
    // `unrecordLog` (HabitRepository.swift) updates the doc with
    // `deleted: true` instead of hard-deleting, which kept the row
    // visible in the feed as a misleading "Habit updated / Pending
    // update" entry even though the client had explicitly un-checked
    // their previous mark. From the trainer's POV the cleanest
    // semantic is "the activity didn't happen", so the row disappears
    // rather than rendering as a pending action.
    if (data.deleted === true) return;

    // Use write-time first so "recent logs" reflects when the coach/client
    // actually changed the habit, not just the civil-date bucket timestamp.
    const eventAt =
      asIso(data.updatedAt) ??
      asIso(data.createdAt) ??
      asIso(data.loggedAt);
    if (!eventAt) return;

    const habitId = typeof data.habitId === "string" ? data.habitId : "";
    const habitName = habitNames.get(habitId) ?? "Habit";
    const completed = boolCompleted(data.value);

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

  // 260524 — chat messages from client. Each row is one message the
  // client sent (we filtered senderId == clientId at the query layer).
  chatSnaps.forEach((snap, idx) => {
    if (!snap) return;
    const client = clients[idx];
    if (!client) return;
    snap.docs.forEach((doc) => {
      const data = doc.data();
      const eventAt = asIso(data.createdAt);
      if (!eventAt) return;
      const kind = typeof data.kind === "string" ? data.kind : "text";
      const text = typeof data.text === "string" ? data.text : "";
      const preview =
        kind === "text"
          ? text.length > 80 ? `${text.slice(0, 80)}…` : text
          : kind === "image"
            ? "(image)"
            : kind === "voice"
              ? "(voice note)"
              : "(message)";
      rows.push({
        id: `chat:${client.uid}:${doc.id}`,
        category: "chat",
        eventAt,
        clientId: client.uid,
        clientName: nameByClientId.get(client.uid) ?? client.uid,
        title: `${nameByClientId.get(client.uid) ?? client.uid} - Sent a message`,
        detail: preview || "(empty)",
        workoutLogId: null,
      });
    });
  });

  // 260524 — progress-photo uploads. Each row is one upload (the
  // 3-angle check-in surfaces as 3 separate rows since each angle is
  // a distinct progress_photos doc — by design, mirrors the iOS
  // upload loop).
  photoSnaps.forEach((snap, idx) => {
    if (!snap) return;
    const client = clients[idx];
    if (!client) return;
    snap.docs.forEach((doc) => {
      const data = doc.data();
      const eventAt = asIso(data.createdAt) ?? asIso(data.checkInDate);
      if (!eventAt) return;
      const angle = typeof data.angle === "string" ? data.angle : "photo";
      const caption = typeof data.caption === "string" ? data.caption : "";
      rows.push({
        id: `photo:${doc.id}`,
        category: "photo",
        eventAt,
        clientId: client.uid,
        clientName: nameByClientId.get(client.uid) ?? client.uid,
        title: `${nameByClientId.get(client.uid) ?? client.uid} - Uploaded a progress photo`,
        detail: caption ? `${angle} · ${caption}` : angle,
        workoutLogId: null,
      });
    });
  });

  // 260524 — body-weight logs. Each row is one measurement.
  weightSnaps.forEach((snap, idx) => {
    if (!snap) return;
    const client = clients[idx];
    if (!client) return;
    snap.docs.forEach((doc) => {
      const data = doc.data();
      const eventAt = asIso(data.recordedAt) ?? asIso(data.createdAt);
      if (!eventAt) return;
      const kg = numeric(data.valueKg);
      if (kg === null) return;
      rows.push({
        id: `weight:${client.uid}:${doc.id}`,
        category: "weight",
        eventAt,
        clientId: client.uid,
        clientName: nameByClientId.get(client.uid) ?? client.uid,
        title: `${nameByClientId.get(client.uid) ?? client.uid} - Logged body weight`,
        detail: `${kg.toFixed(1)} kg`,
        workoutLogId: null,
      });
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

  // iOS writes sets keyed by `exerciseId` (string), not by index — see
  // gc-fitness/GCFitness/Core/Firebase/WorkoutLogRepository.swift:303.
  const templateExerciseById = new Map<string, Record<string, unknown>>();
  for (const exercise of templateExercises) {
    const exId = typeof exercise.exerciseId === "string" ? exercise.exerciseId : "";
    if (exId) templateExerciseById.set(exId, exercise);
  }

  const sets = rawSets.map((set, index) => {
    const exerciseId = typeof set.exerciseId === "string" ? set.exerciseId : "";
    const templateExercise = exerciseId
      ? templateExerciseById.get(exerciseId)
      : undefined;
    const exerciseName = localizedText(templateExercise?.name, `Exercise ${index + 1}`);
    return {
      index: index + 1,
      exerciseName,
      reps: numeric(set.reps),
      // Wire field is `weight_kg` (iOS); keep `weight` as a legacy fallback.
      weight: numeric(set.weight_kg ?? set.weight),
      // Wire field is `completed_at` (iOS); keep `completedAt` as a legacy fallback.
      completedAt: asIso(set.completed_at ?? set.completedAt),
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
