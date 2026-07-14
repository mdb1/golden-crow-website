import { FirestoreCollections } from "./collections";

const EXERCISES = FirestoreCollections.exercises;

type ExerciseDocData = Record<string, unknown>;

type FirestoreLike = {
  collection(name: string): {
    doc(id: string): {
      get(): Promise<{
        id: string;
        exists: boolean;
        data(): Record<string, unknown> | undefined;
      }>;
    };
  };
};

export interface ResolvedExerciseDoc {
  id: string;
  data: ExerciseDocData;
}

function mergedTargetId(data: ExerciseDocData | null | undefined): string | null {
  const raw = data?.mergedInto;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

/**
 * Resolve exercise docs by id, following any `mergedInto` chain so historical
 * workout snapshots can keep their old ids while rendering the canonical
 * standard-library exercise data.
 */
export async function resolveExerciseDocsById(
  db: FirestoreLike,
  ids: string[],
): Promise<Map<string, ExerciseDocData>> {
  const resolved = await resolveExerciseDocsByIdDetailed(db, ids);
  const out = new Map<string, ExerciseDocData>();
  for (const [id, entry] of resolved) {
    out.set(id, entry.data);
  }
  return out;
}

export async function resolveExerciseDocsByIdDetailed(
  db: FirestoreLike,
  ids: string[],
): Promise<Map<string, ResolvedExerciseDoc>> {
  const uniqueIds = Array.from(new Set(ids.filter((id) => id.trim().length > 0)));
  const fetched = new Map<string, ExerciseDocData | null>();
  const queue = [...uniqueIds];

  while (queue.length > 0) {
    const batch = queue.splice(0, 20);
    const snaps = await Promise.all(
      batch.map((id) => db.collection(EXERCISES).doc(id).get()),
    );

    for (const snap of snaps) {
      if (fetched.has(snap.id)) continue;
      const data = snap.exists ? ((snap.data() ?? {}) as ExerciseDocData) : null;
      fetched.set(snap.id, data);
      const target = mergedTargetId(data);
      if (target && !fetched.has(target)) queue.push(target);
    }
  }

  const resolveTerminal = (id: string, seen = new Set<string>()): string | null => {
    if (seen.has(id)) return null;
    seen.add(id);
    const data = fetched.get(id);
    if (!data) return null;
    const target = mergedTargetId(data);
    if (!target) return id;
    if (seen.has(target)) return null;
    return resolveTerminal(target, seen) ?? target;
  };

  const out = new Map<string, ResolvedExerciseDoc>();
  for (const id of uniqueIds) {
    const resolvedId = resolveTerminal(id) ?? id;
    const resolvedData = fetched.get(resolvedId) ?? fetched.get(id);
    if (resolvedData) {
      out.set(id, { id: resolvedId, data: resolvedData });
    }
  }

  return out;
}
