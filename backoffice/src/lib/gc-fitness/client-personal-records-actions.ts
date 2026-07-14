"use server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { coachVisibleClientName } from "./client-name";
import { FirestoreCollections } from "./collections";
import { resolveExerciseDocsByIdDetailed } from "./exercise-resolution";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 40;
const LOG_SCAN_LIMIT = 120;

export type ClientPersonalRecordsFilter =
  | { kind: "all" }
  | { kind: "common" }
  | { kind: "muscle"; muscleGroup: string };

export interface ClientPersonalRecordsCursor {
  startedAtISO: string | null;
  rowOffset: number;
}

export interface ClientPersonalRecordExerciseOption {
  exerciseId: string;
  name: string;
  prCount: number;
  muscleGroups: string[];
}

export interface ClientPersonalRecordsFilters {
  commonExercises: ClientPersonalRecordExerciseOption[];
  muscleGroups: string[];
}

export interface ClientPersonalRecordRow {
  id: string;
  workoutLogId: string;
  workoutName: string;
  exerciseId: string;
  exerciseName: string;
  achievedAtISO: string | null;
  weightKg: number | null;
  reps: number | null;
  estimatedOneRM: number | null;
  durationSeconds: number | null;
  previousEstimatedOneRM: number | null;
  previousDurationSeconds: number | null;
  muscleGroups: string[];
}

export interface ClientPersonalRecordsPage {
  clientId: string;
  clientName: string;
  filters: ClientPersonalRecordsFilters;
  rows: ClientPersonalRecordRow[];
  nextCursor: ClientPersonalRecordsCursor | null;
  hasMore: boolean;
}

interface LogDocLike {
  id: string;
  data: () => Record<string, unknown>;
}

interface ParsedPR {
  workoutLogId: string;
  workoutName: string;
  exerciseId: string;
  setLogId: string;
  achievedAtISO: string | null;
  logStartedAtISO: string | null;
  weightKg: number | null;
  reps: number | null;
  estimatedOneRM: number | null;
  durationSeconds: number | null;
  templateExerciseName: string | null;
}

export async function listClientPersonalRecordsPage(input: {
  clientId: string;
  filter?: ClientPersonalRecordsFilter;
  cursor?: ClientPersonalRecordsCursor | null;
  pageSize?: number;
}): Promise<ClientPersonalRecordsPage> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const clientSnap = await db
    .collection(FirestoreCollections.users)
    .doc(input.clientId)
    .get();
  if (!clientSnap.exists || clientSnap.get("coachId") !== trainer.uid) {
    throw new Error("Forbidden");
  }

  const clientData = clientSnap.data() as {
    displayName?: string;
    email?: string;
    coachNickname?: string;
  } | undefined;
  const clientName = coachVisibleClientName({
    uid: input.clientId,
    displayName: clientData?.displayName ?? clientData?.email ?? input.clientId,
    email: clientData?.email ?? "",
    coachNickname: clientData?.coachNickname ?? null,
  });

  const pageSize = Math.min(
    Math.max(1, input.pageSize ?? DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );
  const filter = input.filter ?? { kind: "all" as const };
  const commonExerciseIds = new Set<string>();
  const logCursor = input.cursor?.startedAtISO ?? null;
  const rowOffset = safeOffset(input.cursor?.rowOffset);

  let query: FirebaseFirestore.Query = db
    .collection(FirestoreCollections.workoutLogs)
    .where("clientId", "==", input.clientId)
    .orderBy("startedAt", "desc")
    .limit(LOG_SCAN_LIMIT);

  if (logCursor) {
    query = query.startAfter(new Date(logCursor));
  }

  const snap = await query.get();
  const docs = snap.docs as LogDocLike[];
  const parsed = parsePRsFromLogs(docs);
  const exerciseMeta = await loadExerciseMeta(db, parsed);
  const filters = buildFilters(parsed, exerciseMeta);
  for (const option of filters.commonExercises.slice(0, 8)) {
    commonExerciseIds.add(option.exerciseId);
  }

  const withDisplay = attachDisplayData(parsed, exerciseMeta);
  const withPrevious = attachPreviousPRs(withDisplay);
  const filtered = withPrevious.filter((row) =>
    rowMatchesFilter(row, filter, commonExerciseIds),
  );
  const rows = filtered.slice(rowOffset, rowOffset + pageSize);
  const fallbackLastDoc = docs[docs.length - 1];
  const fallbackStartedAt = fallbackLastDoc
    ? toIso(fallbackLastDoc.data().startedAt)
    : null;
  const nextRowOffset = rowOffset + rows.length;
  const hasMoreInWindow = nextRowOffset < filtered.length;
  const hasMoreLogs = docs.length === LOG_SCAN_LIMIT && Boolean(fallbackStartedAt);
  const nextCursor = hasMoreInWindow
    ? { startedAtISO: logCursor, rowOffset: nextRowOffset }
    : hasMoreLogs && fallbackStartedAt
      ? { startedAtISO: fallbackStartedAt, rowOffset: 0 }
      : null;

  return {
    clientId: input.clientId,
    clientName,
    filters,
    rows,
    nextCursor,
    hasMore: Boolean(nextCursor),
  };
}

function parsePRsFromLogs(docs: LogDocLike[]): ParsedPR[] {
  const rows: ParsedPR[] = [];
  for (const doc of docs) {
    const data = doc.data();
    if (data.deleted === true || !workoutLogCountsAsCompleted(data)) continue;
    const prs = Array.isArray(data.prs)
      ? (data.prs as Array<Record<string, unknown>>)
      : [];
    if (prs.length === 0) continue;

    const sets = Array.isArray(data.sets)
      ? (data.sets as Array<Record<string, unknown>>)
      : [];
    const setById = new Map<string, Record<string, unknown>>();
    for (const set of sets) {
      const id = typeof set.id === "string" ? set.id : "";
      if (id) setById.set(id, set);
    }

    const templateExercises =
      (data.templateSnapshot as { exercises?: Array<Record<string, unknown>> } | undefined)
        ?.exercises ?? [];
    const templateExerciseNameById = new Map<string, string>();
    for (const exercise of templateExercises) {
      const exerciseId =
        typeof exercise.exerciseId === "string" ? exercise.exerciseId : "";
      if (!exerciseId) continue;
      templateExerciseNameById.set(
        exerciseId,
        localizedName(exercise.name, exerciseId),
      );
    }

    const workoutName = localizedName(
      (data.templateSnapshot as { name?: unknown } | undefined)?.name,
      "Workout",
    );
    const logStartedAtISO = toIso(data.startedAt);

    for (const pr of prs) {
      const setLogId = setLogIdFromPR(pr);
      const set = setLogId ? setById.get(setLogId) : undefined;
      const exerciseId =
        (typeof pr.exerciseId === "string" && pr.exerciseId) ||
        (typeof set?.exerciseId === "string" ? set.exerciseId : "");
      if (!setLogId || !exerciseId) continue;
      rows.push({
        workoutLogId: doc.id,
        workoutName,
        exerciseId,
        setLogId,
        achievedAtISO:
          toIso(pr.achieved_at ?? pr.achievedAt) ??
          toIso(data.completedAt) ??
          logStartedAtISO,
        logStartedAtISO,
        weightKg: numeric(pr.weight_kg ?? pr.weightKg ?? set?.weight_kg ?? set?.weight),
        reps: numeric(pr.reps ?? set?.reps),
        estimatedOneRM: numeric(pr.estimated_one_rm ?? pr.estimatedOneRM),
        durationSeconds: numeric(pr.duration_seconds ?? pr.durationSeconds ?? set?.duration_seconds ?? set?.durationSeconds),
        templateExerciseName:
          localizedNameOrNull(pr.exerciseName) ??
          templateExerciseNameById.get(exerciseId) ??
          null,
      });
    }
  }
  return rows;
}

async function loadExerciseMeta(
  db: FirebaseFirestore.Firestore,
  rows: ParsedPR[],
): Promise<Map<string, { id: string; name: string; muscleGroups: string[] }>> {
  const ids = Array.from(new Set(rows.map((row) => row.exerciseId)));
  if (ids.length === 0) return new Map();
  const docs = await resolveExerciseDocsByIdDetailed(db, ids);
  const out = new Map<string, { id: string; name: string; muscleGroups: string[] }>();
  for (const id of ids) {
    const resolved = docs.get(id);
    const data = resolved?.data;
    out.set(id, {
      id: resolved?.id ?? id,
      name: localizedName(data?.name, id),
      muscleGroups: Array.isArray(data?.muscleGroups)
        ? (data!.muscleGroups as unknown[]).filter(
            (value): value is string => typeof value === "string",
          )
        : [],
    });
  }
  return out;
}

function buildFilters(
  rows: ParsedPR[],
  exerciseMeta: Map<string, { id: string; name: string; muscleGroups: string[] }>,
): ClientPersonalRecordsFilters {
  const byExercise = new Map<string, ClientPersonalRecordExerciseOption>();
  const muscleGroups = new Set<string>();
  for (const row of rows) {
    const meta = exerciseMeta.get(row.exerciseId);
    const exerciseId = meta?.id ?? row.exerciseId;
    const option = byExercise.get(exerciseId);
    if (option) {
      option.prCount += 1;
    } else {
      byExercise.set(exerciseId, {
        exerciseId,
        name: row.templateExerciseName ?? meta?.name ?? row.exerciseId,
        prCount: 1,
        muscleGroups: meta?.muscleGroups ?? [],
      });
    }
    for (const group of meta?.muscleGroups ?? []) muscleGroups.add(group);
  }

  return {
    commonExercises: Array.from(byExercise.values()).sort(
      (a, b) => b.prCount - a.prCount || a.name.localeCompare(b.name),
    ),
    muscleGroups: Array.from(muscleGroups).sort((a, b) =>
      formatMuscleGroup(a).localeCompare(formatMuscleGroup(b)),
    ),
  };
}

function attachDisplayData(
  rows: ParsedPR[],
  exerciseMeta: Map<string, { id: string; name: string; muscleGroups: string[] }>,
): Array<ClientPersonalRecordRow & { logStartedAtISO: string | null }> {
  return rows.map((row) => {
    const meta = exerciseMeta.get(row.exerciseId);
    return {
      id: `${row.workoutLogId}:${row.setLogId}`,
      workoutLogId: row.workoutLogId,
      workoutName: row.workoutName,
      exerciseId: meta?.id ?? row.exerciseId,
      exerciseName: row.templateExerciseName ?? meta?.name ?? row.exerciseId,
      achievedAtISO: row.achievedAtISO,
      weightKg: row.weightKg,
      reps: row.reps,
      estimatedOneRM: row.estimatedOneRM,
      durationSeconds: row.durationSeconds,
      previousEstimatedOneRM: null,
      previousDurationSeconds: null,
      muscleGroups: meta?.muscleGroups ?? [],
      logStartedAtISO: row.logStartedAtISO,
    };
  });
}

function attachPreviousPRs<T extends ClientPersonalRecordRow>(
  rows: T[],
): T[] {
  const chronological = [...rows].sort((a, b) => {
    const aMs = isoMs(a.achievedAtISO);
    const bMs = isoMs(b.achievedAtISO);
    return aMs - bMs;
  });
  const bestE1RMByExercise = new Map<string, number>();
  const bestDurationByExercise = new Map<string, number>();

  for (const row of chronological) {
    row.previousEstimatedOneRM = bestE1RMByExercise.get(row.exerciseId) ?? null;
    row.previousDurationSeconds = bestDurationByExercise.get(row.exerciseId) ?? null;
    if (row.estimatedOneRM !== null && row.estimatedOneRM > 0) {
      bestE1RMByExercise.set(
        row.exerciseId,
        Math.max(row.estimatedOneRM, bestE1RMByExercise.get(row.exerciseId) ?? 0),
      );
    }
    if (row.durationSeconds !== null && row.durationSeconds > 0) {
      bestDurationByExercise.set(
        row.exerciseId,
        Math.max(
          row.durationSeconds,
          bestDurationByExercise.get(row.exerciseId) ?? 0,
        ),
      );
    }
  }

  return rows;
}

function rowMatchesFilter(
  row: ClientPersonalRecordRow,
  filter: ClientPersonalRecordsFilter,
  commonExerciseIds: Set<string>,
): boolean {
  if (filter.kind === "all") return true;
  if (filter.kind === "common") return commonExerciseIds.has(row.exerciseId);
  return row.muscleGroups.includes(filter.muscleGroup);
}

function setLogIdFromPR(pr: Record<string, unknown>): string {
  if (typeof pr.set_log_id === "string") return pr.set_log_id;
  if (typeof pr.setLogId === "string") return pr.setLogId;
  return "";
}

function toIso(value: unknown): string | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = dateFromNumericTimestamp(value);
    return date ? date.toISOString() : null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function isoMs(value: string | null): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function dateFromNumericTimestamp(value: number): Date | null {
  let millis: number;
  if (value > 1_000_000_000_000) {
    millis = value;
  } else if (value > 1_000_000_000) {
    millis = value * 1000;
  } else if (value > 500_000_000) {
    millis = Date.UTC(2001, 0, 1) + value * 1000;
  } else {
    return null;
  }
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeOffset(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : 0;
}

function workoutLogCountsAsCompleted(data: Record<string, unknown>): boolean {
  return data.status === "completed" || Boolean(toIso(data.completedAt));
}

function localizedName(value: unknown, fallback: string): string {
  const direct = localizedNameOrNull(value);
  return direct ?? fallback;
}

function localizedNameOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const localized = value as { es?: unknown; en?: unknown };
    if (typeof localized.es === "string" && localized.es.trim()) {
      return localized.es.trim();
    }
    if (typeof localized.en === "string" && localized.en.trim()) {
      return localized.en.trim();
    }
  }
  return null;
}

function formatMuscleGroup(group: string): string {
  return group.replace(/_/g, " ").replace(/^[a-z]/, (c) => c.toUpperCase());
}
