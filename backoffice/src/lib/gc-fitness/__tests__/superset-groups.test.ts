import {
  compactSupersetGroupLabelsAfterRemoval,
  getSupersetGroupMemberIndexes,
  listSupersetGroupPillLabels,
  getSupersetGroupRest,
  getSupersetMembership,
  listSupersetGroupOptions,
  normalizeSupersetGroup,
  writeSupersetGroupRest,
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

  it("keeps A/B/C visible before the first three groups are all used", () => {
    expect(listSupersetGroupPillLabels([])).toEqual(["A", "B", "C"]);
    expect(listSupersetGroupPillLabels([{ supersetGroup: "A" }])).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(listSupersetGroupPillLabels([{ supersetGroup: "C" }])).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(
      listSupersetGroupPillLabels([
        { supersetGroup: "A" },
        { supersetGroup: "C" },
      ]),
    ).toEqual(["A", "B", "C"]);
    expect(
      listSupersetGroupPillLabels([
        { supersetGroup: "A" },
        { supersetGroup: "A" },
        { supersetGroup: "B" },
        { supersetGroup: "B" },
        { supersetGroup: "C" },
      ]),
    ).toEqual(["A", "B", "C"]);
    expect(
      listSupersetGroupPillLabels([
        { supersetGroup: "A" },
        { supersetGroup: "A" },
        { supersetGroup: "B" },
        { supersetGroup: "B" },
        { supersetGroup: "C" },
        { supersetGroup: "C" },
        { supersetGroup: "D" },
      ]),
    ).toEqual(["A", "B", "C", "D"]);
  });

  it("adds the next superset letter once the visible sequence is used", () => {
    expect(
      listSupersetGroupPillLabels([
        { supersetGroup: "A" },
        { supersetGroup: "A" },
        { supersetGroup: "B" },
        { supersetGroup: "B" },
        { supersetGroup: "C" },
        { supersetGroup: "C" },
      ]),
    ).toEqual(["A", "B", "C", "D"]);
    expect(
      listSupersetGroupPillLabels([
        { supersetGroup: "A" },
        { supersetGroup: "A" },
        { supersetGroup: "B" },
        { supersetGroup: "B" },
        { supersetGroup: "C" },
        { supersetGroup: "C" },
        { supersetGroup: "D" },
        { supersetGroup: "D" },
      ]),
    ).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("compacts later labels when a superset group is removed", () => {
    expect(
      compactSupersetGroupLabelsAfterRemoval(
        [
          { supersetGroup: "A" },
          { supersetGroup: "B" },
          { supersetGroup: "C" },
          { supersetGroup: "E" },
          { supersetGroup: "E" },
        ],
        "D",
      ).map((exercise) => exercise.supersetGroup),
    ).toEqual(["A", "B", "C", "D", "D"]);
    expect(
      compactSupersetGroupLabelsAfterRemoval(
        [
          { supersetGroup: "A" },
          { supersetGroup: "C" },
          { supersetGroup: "D" },
        ],
        "B",
      ).map((exercise) => exercise.supersetGroup),
    ).toEqual(["A", "B", "C"]);
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

describe("superset group rest (D1/D2 canonical last-member rule + write-through)", () => {
  it("reads round rest from the LAST member's rest_seconds (canonicalizes legacy heterogeneous)", () => {
    // Legacy screenshot shape: 180 / 60 / 60 → round rest = last member's 60.
    const exercises = [
      { supersetGroup: "A", rest_seconds: 180, transition_rest_seconds: 30 },
      { supersetGroup: "A", rest_seconds: 60, transition_rest_seconds: 45 },
      { supersetGroup: "A", rest_seconds: 60, transition_rest_seconds: 120 },
    ];
    expect(getSupersetGroupRest(exercises, "A")).toEqual({
      roundRestSeconds: 60,
      afterRestSeconds: 120,
    });
  });

  it("returns nulls when the group has no members or the last member is unset", () => {
    expect(getSupersetGroupRest([], "A")).toEqual({
      roundRestSeconds: null,
      afterRestSeconds: null,
    });
    expect(
      getSupersetGroupRest([{ supersetGroup: "A" }], "A"),
    ).toEqual({ roundRestSeconds: null, afterRestSeconds: null });
  });

  it("writes round rest to EVERY member, homogenizing legacy heterogeneous docs", () => {
    const exercises = [
      { supersetGroup: "A", rest_seconds: 180, transition_rest_seconds: 30 },
      { supersetGroup: "B", rest_seconds: 90, transition_rest_seconds: 60 },
      { supersetGroup: "A", rest_seconds: 60, transition_rest_seconds: 45 },
    ];
    const next = writeSupersetGroupRest(exercises, "A", { rest_seconds: 75 });
    expect(next[0].rest_seconds).toBe(75);
    expect(next[2].rest_seconds).toBe(75);
    // Non-member B untouched (same reference).
    expect(next[1]).toBe(exercises[1]);
    // transition untouched (not in patch).
    expect(next[0].transition_rest_seconds).toBe(30);
  });

  it("writes both round + after rest to every member", () => {
    const exercises = [
      { supersetGroup: "A", rest_seconds: 180, transition_rest_seconds: 30 },
      { supersetGroup: "A", rest_seconds: 60, transition_rest_seconds: 45 },
    ];
    const next = writeSupersetGroupRest(exercises, "A", {
      rest_seconds: 90,
      transition_rest_seconds: 120,
    });
    expect(next.map((e) => e.rest_seconds)).toEqual([90, 90]);
    expect(next.map((e) => e.transition_rest_seconds)).toEqual([120, 120]);
    // Reading back yields the written canonical pair.
    expect(getSupersetGroupRest(next, "A")).toEqual({
      roundRestSeconds: 90,
      afterRestSeconds: 120,
    });
  });

  it("no-op when the group does not exist", () => {
    const exercises = [{ supersetGroup: "A", rest_seconds: 60 }];
    expect(writeSupersetGroupRest(exercises, "Z", { rest_seconds: 30 })).toBe(
      exercises,
    );
  });
});
