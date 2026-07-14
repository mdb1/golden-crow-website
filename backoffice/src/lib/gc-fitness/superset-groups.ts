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

const DEFAULT_SUPERSET_PILL_LABELS = ["A", "B", "C"] as const;

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

export function listSupersetGroupPillLabels(
  exercises: SupersetGroupExerciseLike[],
): string[] {
  const used = listSupersetGroupOptions(exercises);
  const labels = new Set<string>(DEFAULT_SUPERSET_PILL_LABELS);
  for (const group of used) labels.add(group);

  const selectedValues = new Set(
    Array.from(countAlphabeticSupersetGroups(exercises))
      .filter(([, count]) => count >= 2)
      .map(([value]) => value),
  );
  const defaultMax = alphabeticLabelValue(
    DEFAULT_SUPERSET_PILL_LABELS[DEFAULT_SUPERSET_PILL_LABELS.length - 1],
  );
  if (defaultMax !== null) {
    let contiguous = 0;
    while (selectedValues.has(contiguous + 1)) contiguous += 1;
    if (contiguous >= defaultMax) {
      labels.add(alphabeticLabelFromValue(contiguous + 1));
    }
  }

  return Array.from(labels).sort(compareSupersetGroupLabels);
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

export function compactSupersetGroupLabelsAfterRemoval<
  T extends SupersetGroupExerciseLike,
>(exercises: T[], removedGroup: string): T[] {
  const removedValue = alphabeticLabelValue(normalizeSupersetGroup(removedGroup));
  if (removedValue === null) return exercises;

  const usedAfterRemoval = Array.from(
    new Set(
      exercises
        .map((exercise) =>
          alphabeticLabelValue(normalizeSupersetGroup(exercise.supersetGroup)),
        )
        .filter(
          (value): value is number =>
            value !== null && value > removedValue,
        ),
    ),
  ).sort((a, b) => a - b);
  if (usedAfterRemoval.length === 0) return exercises;

  const remapped = new Map<number, string>();
  usedAfterRemoval.forEach((value, offset) => {
    const nextValue = removedValue + offset;
    if (nextValue !== value) {
      remapped.set(value, alphabeticLabelFromValue(nextValue));
    }
  });
  if (remapped.size === 0) return exercises;

  return exercises.map((exercise) => {
    const value = alphabeticLabelValue(
      normalizeSupersetGroup(exercise.supersetGroup),
    );
    const nextGroup = value === null ? undefined : remapped.get(value);
    return nextGroup ? { ...exercise, supersetGroup: nextGroup } : exercise;
  });
}

function compareSupersetGroupLabels(a: string, b: string): number {
  const left = alphabeticLabelValue(a);
  const right = alphabeticLabelValue(b);
  if (left !== null && right !== null) return left - right;
  if (left !== null) return -1;
  if (right !== null) return 1;
  return a.localeCompare(b);
}

function countAlphabeticSupersetGroups(
  exercises: SupersetGroupExerciseLike[],
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const exercise of exercises) {
    const value = alphabeticLabelValue(
      normalizeSupersetGroup(exercise.supersetGroup),
    );
    if (value === null) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function alphabeticLabelValue(label: string): number | null {
  const normalized = label.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) return null;
  let value = 0;
  for (const char of normalized) {
    value = value * 26 + char.charCodeAt(0) - 64;
  }
  return value;
}

function alphabeticLabelFromValue(value: number): string {
  let remaining = Math.max(1, Math.floor(value));
  let label = "";
  while (remaining > 0) {
    remaining -= 1;
    label = String.fromCharCode(65 + (remaining % 26)) + label;
    remaining = Math.floor(remaining / 26);
  }
  return label;
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
