// Unit tests for superset grouping (twin of iOS SupersetGrouping.swift).

import {
  flattenedCoordinates,
  groupIntoSupersetBlocks,
  isExerciseTransition,
  prescribedRestSeconds,
  shouldRest,
  type SequenceExercise,
  type SupersetCoordinate,
} from "../live-workout-supersets";

function ex(name: string, supersetGroup: string | null = null) {
  return { name, supersetGroup };
}

// Minimal SequenceExercise fixture — mirrors SupersetAdvanceTests.makeSnapshot.
function seq(
  id: string,
  sets: number,
  supersetGroup: string | null = null,
  restSeconds = 60,
  transitionRestSeconds: number | null = null,
): SequenceExercise {
  return { exerciseId: id, sets, restSeconds, transitionRestSeconds, supersetGroup };
}

function coord(exerciseId: string, setIndex: number): SupersetCoordinate {
  return { exerciseId, setIndex };
}

describe("groupIntoSupersetBlocks", () => {
  it("makes each standalone exercise its own non-superset block", () => {
    const blocks = groupIntoSupersetBlocks([ex("squat"), ex("bench"), ex("row")]);
    expect(blocks).toHaveLength(3);
    expect(blocks.every((b) => !b.isSuperset && b.groupLabel === null)).toBe(true);
  });

  it("groups consecutive same-label exercises into one superset block", () => {
    const blocks = groupIntoSupersetBlocks([
      ex("curl", "A"),
      ex("pushdown", "A"),
      ex("plank"),
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].isSuperset).toBe(true);
    expect(blocks[0].groupLabel).toBe("A");
    expect(blocks[0].exercises.map((e) => e.name)).toEqual(["curl", "pushdown"]);
    expect(blocks[1].isSuperset).toBe(false);
  });

  it("keeps separate blocks for different labels even when adjacent", () => {
    const blocks = groupIntoSupersetBlocks([
      ex("a1", "A"),
      ex("a2", "A"),
      ex("b1", "B"),
      ex("b2", "B"),
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].groupLabel).toBe("A");
    expect(blocks[1].groupLabel).toBe("B");
    expect(blocks.every((b) => b.isSuperset)).toBe(true);
  });

  it("a lone labelled exercise is a block but NOT a superset", () => {
    const blocks = groupIntoSupersetBlocks([ex("only", "A"), ex("squat")]);
    expect(blocks[0].groupLabel).toBe("A");
    expect(blocks[0].isSuperset).toBe(false);
  });

  it("treats empty / whitespace labels as standalone", () => {
    const blocks = groupIntoSupersetBlocks([ex("a", "   "), ex("b", "")]);
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.groupLabel === null)).toBe(true);
  });

  it("does not merge same-label blocks separated by a standalone", () => {
    const blocks = groupIntoSupersetBlocks([
      ex("a1", "A"),
      ex("mid"),
      ex("a2", "A"),
    ]);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].isSuperset).toBe(false);
    expect(blocks[2].isSuperset).toBe(false);
  });
});

// --- Flattened sequence + round-based rest twins (mirror SupersetAdvanceTests) ---

describe("SupersetSequence twins (twin of SupersetGrouping.swift / SupersetAdvanceTests)", () => {
  // Two-exercise superset, both label "A", adjacent, 3 sets each.
  const superset = () => [seq("A", 3, "A"), seq("B", 3, "A")];
  // Single standalone exercise, 3 sets.
  const standalone = () => [seq("S", 3)];

  it("flattens a superset interleaved A.0→B.0→A.1→B.1→A.2→B.2", () => {
    expect(flattenedCoordinates(superset())).toEqual([
      coord("A", 0), coord("B", 0),
      coord("A", 1), coord("B", 1),
      coord("A", 2), coord("B", 2),
    ]);
  });

  it("flattens a standalone exercise linearly S.0→S.1→S.2", () => {
    expect(flattenedCoordinates(standalone())).toEqual([
      coord("S", 0), coord("S", 1), coord("S", 2),
    ]);
  });

  it("shouldRest is false after A.x (hand off to sibling), true after last sibling B.x", () => {
    const f = superset();
    expect(shouldRest(coord("A", 0), f)).toBe(false);
    expect(shouldRest(coord("A", 1), f)).toBe(false);
    expect(shouldRest(coord("A", 2), f)).toBe(false);
    expect(shouldRest(coord("B", 0), f)).toBe(true);
    expect(shouldRest(coord("B", 1), f)).toBe(true);
    expect(shouldRest(coord("B", 2), f)).toBe(true);
  });

  it("standalone always rests after every set", () => {
    const f = standalone();
    expect(shouldRest(coord("S", 0), f)).toBe(true);
    expect(shouldRest(coord("S", 1), f)).toBe(true);
    expect(shouldRest(coord("S", 2), f)).toBe(true);
  });

  it("transition rest applies only after the last set before a different exercise", () => {
    const f = [seq("A", 2, null, 30, 120), seq("B", 2, null, 45)];
    expect(isExerciseTransition(coord("A", 0), f)).toBe(false);
    expect(prescribedRestSeconds(coord("A", 0), f)).toBe(30);
    expect(isExerciseTransition(coord("A", 1), f)).toBe(true);
    expect(prescribedRestSeconds(coord("A", 1), f)).toBe(120);
    expect(isExerciseTransition(coord("B", 1), f)).toBe(false);
    expect(prescribedRestSeconds(coord("B", 1), f)).toBe(45);
  });

  it("missing transition rest falls back to the default 60s handoff rest", () => {
    const f = [seq("A", 1, null, 30), seq("B", 1, null, 45)];
    expect(isExerciseTransition(coord("A", 0), f)).toBe(true);
    expect(prescribedRestSeconds(coord("A", 0), f)).toBe(60);
  });

  it("zero rest stays zero so UI layers treat it as no timer", () => {
    const f = [seq("S", 3, null, 0)];
    expect(prescribedRestSeconds(coord("S", 0), f)).toBe(0);
  });

  // D3: round rest = the block's LAST member's restSeconds, NOT the completing
  // sibling's. Heterogeneous member rests (legacy 3m/1m/1m docs) canonicalize.
  it("D3: superset round rest = the block's last member's restSeconds (heterogeneous members)", () => {
    // Three-member superset, rests 180 / 60 / 90 → round rest resolves to the
    // LAST member's 90 no matter which sibling completes the round.
    const f = [
      seq("A", 3, "A", 180, 30),
      seq("B", 3, "A", 60, 45),
      seq("C", 3, "A", 90, 120),
    ];
    // Only the last effective sibling (C) rests; its round rest = 90 (its own,
    // which is also the last member's) for the non-final rounds.
    expect(shouldRest(coord("A", 0), f)).toBe(false);
    expect(shouldRest(coord("B", 0), f)).toBe(false);
    expect(shouldRest(coord("C", 0), f)).toBe(true);
    expect(prescribedRestSeconds(coord("C", 0), f)).toBe(90);
    expect(prescribedRestSeconds(coord("C", 1), f)).toBe(90);
    // Final coordinate of the block (C.2) — no next exercise → NOT a transition
    // (nothing after it), so it still resolves to the round rest (last member).
    expect(prescribedRestSeconds(coord("C", 2), f)).toBe(90);
  });

  // D1: uneven member sets — the last member owns the canonical round rest even
  // when an earlier member owns the final round's coordinate.
  it("D1: uneven-set superset resolves round rest to the last member's restSeconds", () => {
    // A has 3 sets, B has 2; round 2 (setIndex 2) only A participates.
    const f = [seq("A", 3, "A", 30), seq("B", 2, "A", 90)];
    expect(flattenedCoordinates(f)).toEqual([
      coord("A", 0), coord("B", 0),
      coord("A", 1), coord("B", 1),
      coord("A", 2),
    ]);
    // A.2 is the last effective sibling of round 2 → rests. Round rest = last
    // member's (B's) 90, not A's 30. A.2 is A's final set with no next
    // coordinate → not a transition, so still the round rest.
    expect(shouldRest(coord("A", 2), f)).toBe(true);
    expect(prescribedRestSeconds(coord("A", 2), f)).toBe(90);
  });

  it("end-of-block transition rest resolves at the block's final coordinate", () => {
    // Superset A/B (2 sets each), then standalone C. After B.1 (block final
    // coordinate) the next slot is C.0 → transition → B's transitionRestSeconds.
    const f = [
      seq("A", 2, "A", 30, 15),
      seq("B", 2, "A", 60, 120),
      seq("C", 2, null, 90),
    ];
    expect(isExerciseTransition(coord("B", 1), f)).toBe(true);
    expect(prescribedRestSeconds(coord("B", 1), f)).toBe(120);
    // Standalone C rests with its own restSeconds.
    expect(prescribedRestSeconds(coord("C", 0), f)).toBe(90);
  });
});
