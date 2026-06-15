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

  it("workoutLogs is 'workout_logs' (P05-01 — same-commit invariant w/ Collections.swift)", () => {
    expect(FirestoreCollections.workoutLogs).toBe("workout_logs");
  });

  it("habits is 'habits' (P06-01 — same-commit invariant w/ Collections.swift)", () => {
    expect(FirestoreCollections.habits).toBe("habits");
  });

  it("habitLogs is 'habit_logs' (P06-01 — composite doc ID `${habitId}_${civilDate}` lives on this collection)", () => {
    expect(FirestoreCollections.habitLogs).toBe("habit_logs");
  });

  it("chats is 'chats' (P08-04 — same-commit invariant w/ Collections.swift)", () => {
    expect(FirestoreCollections.chats).toBe("chats");
  });

  it("messages is 'messages' (P08-04 — subcollection name for /chats/{chatId}/messages)", () => {
    expect(FirestoreCollections.messages).toBe("messages");
  });

  it("exercises is 'exercises' (carried over from P03)", () => {
    expect(FirestoreCollections.exercises).toBe("exercises");
  });

  it("clientExerciseNotes is 'client_exercise_notes' (backoffice-live-workout #7 — Admin-SDK-only writer)", () => {
    expect(FirestoreCollections.clientExerciseNotes).toBe(
      "client_exercise_notes",
    );
  });

  it("appConfig is 'app_config' (force-update gate — same-commit invariant w/ Collections.swift)", () => {
    expect(FirestoreCollections.appConfig).toBe("app_config");
  });

  it("auditLog is 'audit_log' (#312 PR2 — server/functions-only, no Swift twin)", () => {
    expect(FirestoreCollections.auditLog).toBe("audit_log");
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
