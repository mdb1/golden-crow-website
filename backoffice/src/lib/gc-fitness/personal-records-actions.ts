"use server";

// personal-records-actions.ts — server reads for a client's personal records
// (issue #405). PRs live on each workout_logs doc's `prs[]`; there is no
// separate collection, so we scan the client's recent logs, flatten every PR,
// and hand the rows to the pure grouping logic in personal-records.ts.
//
// READ-COST: ONE bounded query — `workout_logs where clientId == X orderBy
// startedAt desc limit 300` (reuses the existing (clientId, startedAt DESC)
// composite index; no date bound so a long-standing record still surfaces) +
// ONE batched getAll for the PR exercises' muscle groups.

import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import {
  buildPersonalRecords,
  flattenLogPRs,
  type PersonalRecordEntry,
  type PRExerciseMeta,
  type RawPersonalRecord,
} from "@/lib/gc-fitness/personal-records";

const LOG_FETCH_LIMIT = 300;

export interface ClientPersonalRecords {
  clientId: string;
  records: PersonalRecordEntry[];
}

function localizedName(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const loc = value as { es?: unknown; en?: unknown };
    if (typeof loc.es === "string" && loc.es.trim()) return loc.es.trim();
    if (typeof loc.en === "string" && loc.en.trim()) return loc.en.trim();
  }
  return fallback;
}

/**
 * Read-only: all of a client's personal records with the record each one beat,
 * plus exercise name / muscle groups / session count for the coach's filters.
 * Trainer-auth gated + per-client ownership checked.
 */
export async function listClientPersonalRecords(
  clientId: string,
): Promise<ClientPersonalRecords> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  const clientSnap = await db
    .collection(FirestoreCollections.users)
    .doc(clientId)
    .get();
  if (!clientSnap.exists || clientSnap.get("coachId") !== trainer.uid) {
    return { clientId, records: [] };
  }

  const snap = await db
    .collection(FirestoreCollections.workoutLogs)
    .where("clientId", "==", clientId)
    .orderBy("startedAt", "desc")
    .limit(LOG_FETCH_LIMIT)
    .get();

  const allPrs: RawPersonalRecord[] = [];
  const nameById = new Map<string, string>();
  const sessionCountById = new Map<string, number>();

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;

    // Names from the log's templateSnapshot (same source the detail builder uses).
    const templateExercises =
      (data.templateSnapshot as { exercises?: Array<Record<string, unknown>> } | undefined)
        ?.exercises ?? [];
    for (const ex of templateExercises) {
      const exId = typeof ex.exerciseId === "string" ? ex.exerciseId : "";
      if (exId && !nameById.has(exId)) nameById.set(exId, localizedName(ex.name, exId));
    }

    // Session count = # of sessions with a completed set for the exercise
    // (matches the "most common" ordering in exercise-progress).
    const rawSets = Array.isArray(data.sets)
      ? (data.sets as Array<Record<string, unknown>>)
      : [];
    const exercisesThisSession = new Set<string>();
    for (const s of rawSets) {
      const exId = typeof s.exerciseId === "string" ? s.exerciseId : "";
      if (!exId) continue;
      if (Boolean(s.completed_at ?? s.completedAt)) exercisesThisSession.add(exId);
    }
    for (const exId of exercisesThisSession) {
      sessionCountById.set(exId, (sessionCountById.get(exId) ?? 0) + 1);
    }

    allPrs.push(...flattenLogPRs(data));
  }

  // Resolve muscle groups for the exercises that actually have a PR — one
  // batched getAll (bounded by the client's PR variety).
  const prExerciseIds = Array.from(new Set(allPrs.map((p) => p.exerciseId)));
  const muscleById = new Map<string, string[]>();
  if (prExerciseIds.length > 0) {
    const refs = prExerciseIds.map((exId) =>
      db.collection(FirestoreCollections.exercises).doc(exId),
    );
    const exerciseDocs = await db.getAll(...refs);
    for (const exDoc of exerciseDocs) {
      if (!exDoc.exists) continue;
      const mg = exDoc.get("muscleGroups");
      if (Array.isArray(mg)) {
        muscleById.set(exDoc.id, mg.filter((v): v is string => typeof v === "string"));
      }
      // Prefer the canonical exercise-doc name over the snapshot when present.
      const docName = localizedName(exDoc.get("name"), "");
      if (docName) nameById.set(exDoc.id, docName);
    }
  }

  const meta = new Map<string, PRExerciseMeta>();
  for (const exId of prExerciseIds) {
    meta.set(exId, {
      name: nameById.get(exId) ?? exId,
      muscleGroups: muscleById.get(exId) ?? [],
      sessionCount: sessionCountById.get(exId) ?? 0,
    });
  }

  return { clientId, records: buildPersonalRecords(allPrs, meta) };
}
