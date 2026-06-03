export interface SupersetGroupExerciseLike {
  supersetGroup?: string | null | undefined;
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
