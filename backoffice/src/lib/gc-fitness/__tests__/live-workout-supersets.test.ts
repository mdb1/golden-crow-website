// Unit tests for superset grouping (twin of iOS SupersetGrouping.swift).

import { groupIntoSupersetBlocks } from "../live-workout-supersets";

function ex(name: string, supersetGroup: string | null = null) {
  return { name, supersetGroup };
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
