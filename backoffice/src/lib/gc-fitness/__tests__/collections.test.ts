// collections.test.ts
// Locks the FirestoreCollections constants against drift with the Swift
// canonical source in:
//   gc-fitness/Packages/GCFitnessCore/Sources/GCFitnessCore/Schema/Collections.swift
//
// (Pitfall 7 — Schema Constant Drift — 04-RESEARCH.md)
//
// Any rename here MUST be matched in Collections.swift in the SAME commit,
// and `SchemaTests` (Swift) + this suite (TS) both check the literal value
// so neither side can drift silently.

import { FirestoreCollections } from "../collections";

describe("FirestoreCollections — literal-string contract with Swift twin", () => {
  it("workoutTemplates is 'workout_templates'", () => {
    expect(FirestoreCollections.workoutTemplates).toBe("workout_templates");
  });

  it("workoutAssignments is 'workout_assignments'", () => {
    expect(FirestoreCollections.workoutAssignments).toBe("workout_assignments");
  });

  it("exercises is 'exercises' (carried over from P03)", () => {
    expect(FirestoreCollections.exercises).toBe("exercises");
  });

  it("every value is lowercase snake_case", () => {
    for (const [key, value] of Object.entries(FirestoreCollections)) {
      expect(value).toBe(value.toLowerCase());
      // We allow letters, digits and underscores — same shape as the Swift twin.
      expect(/^[a-z0-9_]+$/.test(value)).toBe(true);
      // The TS key is camelCase, but the value must NOT be — guards against
      // someone re-using the key as a value by mistake.
      if (key !== value) {
        expect(value).not.toBe(key);
      }
    }
  });
});
