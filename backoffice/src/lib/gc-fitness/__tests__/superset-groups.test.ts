import {
  getSupersetGroupMemberIndexes,
  getSupersetMembership,
  listSupersetGroupOptions,
  normalizeSupersetGroup,
} from "../superset-groups";

describe("superset-groups", () => {
  const exercises = [
    { supersetGroup: "A" },
    { supersetGroup: "A" },
    { supersetGroup: "B" },
    { supersetGroup: "  B  " },
    { supersetGroup: "" },
    {},
  ];

  it("normalizes blank values to empty strings", () => {
    expect(normalizeSupersetGroup(undefined)).toBe("");
    expect(normalizeSupersetGroup("  A  ")).toBe("A");
  });

  it("lists unique superset pills in order", () => {
    expect(listSupersetGroupOptions(exercises)).toEqual(["A", "B"]);
  });

  it("finds all members for a group", () => {
    expect(getSupersetGroupMemberIndexes(exercises, "A")).toEqual([0, 1]);
    expect(getSupersetGroupMemberIndexes(exercises, "B")).toEqual([2, 3]);
  });

  it("marks the first member as leader and later members as followers", () => {
    expect(getSupersetMembership(exercises, 0)).toMatchObject({
      group: "A",
      memberIndexes: [0, 1],
      leaderIndex: 0,
      isGrouped: true,
      isLeader: true,
      isFollower: false,
    });
    expect(getSupersetMembership(exercises, 1)).toMatchObject({
      group: "A",
      memberIndexes: [0, 1],
      leaderIndex: 0,
      isGrouped: true,
      isLeader: false,
      isFollower: true,
    });
  });
});
