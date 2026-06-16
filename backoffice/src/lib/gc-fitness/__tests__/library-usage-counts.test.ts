import {
  tallyExerciseUsage,
  tallyTemplateAssignments,
} from "../library-usage-counts";

describe("tallyExerciseUsage", () => {
  it("counts distinct templates per exerciseId", () => {
    const counts = tallyExerciseUsage([
      { id: "t1", exercises: [{ exerciseId: "a" }, { exerciseId: "b" }] },
      { id: "t2", exercises: [{ exerciseId: "a" }] },
    ]);
    expect(counts).toEqual({ a: 2, b: 1 });
  });

  it("counts a template once even if it lists the same exercise twice", () => {
    const counts = tallyExerciseUsage([
      { id: "t1", exercises: [{ exerciseId: "a" }, { exerciseId: "a" }] },
    ]);
    expect(counts).toEqual({ a: 1 });
  });

  it("ignores deleted templates and blank/missing exercise ids", () => {
    const counts = tallyExerciseUsage([
      { id: "t1", deleted: true, exercises: [{ exerciseId: "a" }] },
      { id: "t2", exercises: [{ exerciseId: "" }, { exerciseId: null }, null] },
      { id: "t3", exercises: null },
      { id: "t4", exercises: [{ exerciseId: "b" }] },
    ]);
    expect(counts).toEqual({ b: 1 });
  });
});

describe("tallyTemplateAssignments", () => {
  const today = "2026-06-16";

  it("counts today and future, ignores the past", () => {
    const counts = tallyTemplateAssignments(
      [
        { id: "a1", templateId: "t1", scheduledFor: "2026-06-15" }, // past
        { id: "a2", templateId: "t1", scheduledFor: "2026-06-16" }, // today
        { id: "a3", templateId: "t1", scheduledFor: "2026-06-20" }, // future
      ],
      today,
    );
    expect(counts).toEqual({ t1: 2 });
  });

  it("collapses a recurring series to one, counting it if any occurrence is today/future", () => {
    const counts = tallyTemplateAssignments(
      [
        { id: "a1", templateId: "t1", scheduledFor: "2026-06-10", seriesId: "S" },
        { id: "a2", templateId: "t1", scheduledFor: "2026-06-17", seriesId: "S" },
        { id: "a3", templateId: "t1", scheduledFor: "2026-06-24", seriesId: "S" },
        { id: "a4", templateId: "t1", scheduledFor: "2026-06-18" }, // separate one-off
      ],
      today,
    );
    // series S = 1 (has future occurrences) + one-off a4 = 1 → total 2
    expect(counts).toEqual({ t1: 2 });
  });

  it("drops a series whose only occurrences are in the past", () => {
    const counts = tallyTemplateAssignments(
      [
        { id: "a1", templateId: "t1", scheduledFor: "2026-06-01", seriesId: "S" },
        { id: "a2", templateId: "t1", scheduledFor: "2026-06-08", seriesId: "S" },
      ],
      today,
    );
    expect(counts).toEqual({});
  });

  it("buckets per template and skips docs without a templateId", () => {
    const counts = tallyTemplateAssignments(
      [
        { id: "a1", templateId: "t1", scheduledFor: "2026-06-20" },
        { id: "a2", templateId: "t2", scheduledFor: "2026-06-20" },
        { id: "a3", templateId: null, scheduledFor: "2026-06-20" },
        { id: "a4", templateId: "", scheduledFor: "2026-06-20" },
      ],
      today,
    );
    expect(counts).toEqual({ t1: 1, t2: 1 });
  });
});
