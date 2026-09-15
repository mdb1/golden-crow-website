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

// ── gc-fitness#1078 — the delete guard ──────────────────────────────────────
//
// `templatesUsingExercise` is what stands between a coach's delete and a
// routine row that renders as "Ejercicio 3" forever. The count pill next to it
// already existed and did not prevent anything; the difference is that this one
// blocks the write and names the routines, because the only way past the block
// is to open them and swap the exercise out.

import { templatesUsingExercise } from "@/lib/gc-fitness/library-usage-counts";

function template(
  id: string,
  exerciseIds: string[],
  extra: { deleted?: boolean; name?: { en?: string; es?: string } } = {},
) {
  return {
    id,
    exercises: exerciseIds.map((exerciseId) => ({ exerciseId })),
    ...extra,
  };
}

describe("templatesUsingExercise", () => {
  it("finds the live routines that reference the exercise", () => {
    const found = templatesUsingExercise(
      [
        template("t1", ["bench", "squat"], { name: { es: "Empuje" } }),
        template("t2", ["squat"], { name: { es: "Pierna" } }),
        template("t3", ["bench"], { name: { es: "Full body" } }),
      ],
      "bench",
    );

    expect(found.map((t) => t.id).sort()).toEqual(["t1", "t3"]);
  });

  it("ignores DELETED routines — they hold nobody back", () => {
    // Blocking on a routine the coach already threw away would be a dead end
    // with no way out: there is no UI to edit a deleted routine.
    const found = templatesUsingExercise(
      [
        template("gone", ["bench"], { deleted: true, name: { es: "Vieja" } }),
        template("live", ["bench"], { name: { es: "Actual" } }),
      ],
      "bench",
    );

    expect(found.map((t) => t.id)).toEqual(["live"]);
  });

  it("allows the delete when nothing references it", () => {
    // The guard must not turn "delete an exercise" into "you can never delete
    // an exercise" — an unused one goes without friction.
    expect(
      templatesUsingExercise([template("t1", ["squat"])], "bench"),
    ).toEqual([]);
  });

  it("prefers the Spanish routine name, then English, then the id", () => {
    // The name is the actionable part of the error the coach reads.
    const found = templatesUsingExercise(
      [
        template("a", ["bench"], { name: { en: "Push day", es: "Empuje" } }),
        template("b", ["bench"], { name: { en: "Pull day" } }),
        template("c", ["bench"], { name: { en: "  ", es: "  " } }),
      ],
      "bench",
    );

    // Keyed by id, because the list comes back sorted by NAME (so the message
    // the coach reads is stable; Firestore hands docs back in id order).
    expect(Object.fromEntries(found.map((t) => [t.id, t.name]))).toEqual({
      a: "Empuje",
      b: "Pull day",
      c: "c",
    });
  });

  it("sorts by name so the error message is stable across calls", () => {
    const found = templatesUsingExercise(
      [
        template("z", ["bench"], { name: { es: "Abdominales" } }),
        template("a", ["bench"], { name: { es: "Zancadas" } }),
      ],
      "bench",
    );

    expect(found.map((t) => t.name)).toEqual(["Abdominales", "Zancadas"]);
  });

  it("survives the malformed shapes a real collection contains", () => {
    // 256 production templates: some predate fields, some carry nulls. A throw
    // here would block EVERY delete, which is worse than the bug being fixed.
    const found = templatesUsingExercise(
      [
        { id: "no-exercises" },
        { id: "null-exercises", exercises: null },
        { id: "null-entry", exercises: [null, { exerciseId: "bench" }] },
        { id: "no-id-field", exercises: [{ exerciseId: null }] },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...([null] as any),
      ],
      "bench",
    );

    expect(found.map((t) => t.id)).toEqual(["null-entry"]);
  });

  it("returns nothing for a blank exercise id", () => {
    // A blank id would otherwise match every `exerciseId: ""` row and block
    // deletes that have nothing to do with it.
    expect(templatesUsingExercise([template("t1", [""])], "")).toEqual([]);
  });
});
