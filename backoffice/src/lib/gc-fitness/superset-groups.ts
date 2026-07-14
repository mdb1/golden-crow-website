export interface SupersetGroupExerciseLike {
  supersetGroup?: string | null | undefined;
}

/** Superset member carrying the snake_case rest prescriptions (the template-form
 *  / assignment shape). Used by the group-rest get/set helpers below. */
export interface SupersetRestExerciseLike extends SupersetGroupExerciseLike {
  rest_seconds?: number | null | undefined;
  transition_rest_seconds?: number | null | undefined;
}

/** Canonical group-level rest for a superset label (D1):
 *   - roundRestSeconds  = the block's LAST member's `rest_seconds` (the rest
 *     between rounds — matches the round-based runtime for equal-set blocks).
 *   - afterRestSeconds  = the block's LAST member's `transition_rest_seconds`
 *     (the rest AFTER the superset ends, i.e. transition resolution at the
 *     block's final coordinate).
 *  Returns `null` for a field the last member leaves unset. */
export interface SupersetGroupRest {
  roundRestSeconds: number | null;
  afterRestSeconds: number | null;
}

export function normalizeSupersetGroup(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function listSupersetGroupOptions(
  exercises: SupersetGroupExerciseLike[],
): string[] {
  const groups = new Set<string>();
  for (const exercise of exercises) {
    const group = normalizeSupersetGroup(exercise.supersetGroup);
    if (group) groups.add(group);
  }
  return Array.from(groups).sort((a, b) => a.localeCompare(b));
}

export function getSupersetGroupMemberIndexes(
  exercises: SupersetGroupExerciseLike[],
  group: string,
): number[] {
  const normalized = normalizeSupersetGroup(group);
  if (!normalized) return [];
  const members: number[] = [];
  exercises.forEach((exercise, index) => {
    if (normalizeSupersetGroup(exercise.supersetGroup) === normalized) {
      members.push(index);
    }
  });
  return members;
}

/**
 * Read the canonical group rest for a superset label (D1). Round rest = the
 * block's LAST member's `rest_seconds`; after-superset rest = that same last
 * member's `transition_rest_seconds`. Legacy heterogeneous member rests
 * (e.g. 180/60/60) canonicalize to the last member's values here so every
 * editing surface shows ONE well-defined pair.
 */
export function getSupersetGroupRest(
  exercises: SupersetRestExerciseLike[],
  group: string,
): SupersetGroupRest {
  const members = getSupersetGroupMemberIndexes(exercises, group);
  if (members.length === 0) {
    return { roundRestSeconds: null, afterRestSeconds: null };
  }
  const last = exercises[members[members.length - 1]];
  const round =
    typeof last?.rest_seconds === "number" && Number.isFinite(last.rest_seconds)
      ? last.rest_seconds
      : null;
  const after =
    typeof last?.transition_rest_seconds === "number" &&
    Number.isFinite(last.transition_rest_seconds)
      ? last.transition_rest_seconds
      : null;
  return { roundRestSeconds: round, afterRestSeconds: after };
}

/**
 * Write group rest values to ALL members of a superset label (D2 write-through)
 * — the self-healing edit that homogenizes legacy heterogeneous member rests.
 * Pure: returns a new array; only keys present in `patch` are written, and only
 * to members of `group`. Non-members are returned untouched (by reference).
 *
 * @param patch `rest_seconds` (round rest) and/or `transition_rest_seconds`
 *              (after-superset rest) to stamp on every member.
 */
export function writeSupersetGroupRest<T extends SupersetRestExerciseLike>(
  exercises: T[],
  group: string,
  patch: { rest_seconds?: number | null; transition_rest_seconds?: number | null },
): T[] {
  const members = new Set(getSupersetGroupMemberIndexes(exercises, group));
  if (members.size === 0) return exercises;
  return exercises.map((exercise, index) => {
    if (!members.has(index)) return exercise;
    const next = { ...exercise };
    if ("rest_seconds" in patch) next.rest_seconds = patch.rest_seconds;
    if ("transition_rest_seconds" in patch) {
      next.transition_rest_seconds = patch.transition_rest_seconds;
    }
    return next;
  });
}

export function getSupersetMembership(
  exercises: SupersetGroupExerciseLike[],
  index: number,
) {
  const group = normalizeSupersetGroup(exercises[index]?.supersetGroup);
  if (!group) {
    return {
      group: "",
      memberIndexes: [] as number[],
      leaderIndex: null as number | null,
      isGrouped: false,
      isLeader: false,
      isFollower: false,
    };
  }

  const memberIndexes = getSupersetGroupMemberIndexes(exercises, group);
  const leaderIndex = memberIndexes[0] ?? null;
  return {
    group,
    memberIndexes,
    leaderIndex,
    isGrouped: memberIndexes.length > 1,
    isLeader: leaderIndex === index,
    isFollower: leaderIndex !== null && leaderIndex !== index,
  };
}
