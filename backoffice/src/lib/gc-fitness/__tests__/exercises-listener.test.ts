// exercises-listener.test.ts
//
// 260522-mo2 Revision fix #1 (Blocker): tests that the snapToRow ternary
// discriminates ALL THREE source cases — "wger", "free-exercise-db", and
// "trainer" — instead of silently coercing any non-"wger" wire value to
// "trainer" (the prior 2-way ternary's behavior, which was the blocker for
// the fexd rollout).
//
// Pure data-transform — no DOM. Uses the default `node` jest environment.
// firebase/firestore is mocked away to avoid pulling in the Auth client.

jest.mock("firebase/firestore", () => ({
  // We only use the `QueryDocumentSnapshot` / `DocumentData` type imports —
  // no runtime exports are referenced in snapToRow. Stub to empty object.
  getFirestore: jest.fn(),
  collection: jest.fn(),
  onSnapshot: jest.fn(),
  query: jest.fn(),
  orderBy: jest.fn(),
}));

// Stub the gc-fitness firebase client binding (referenced via top-level
// import in exercises-listener.ts) so the test doesn't try to initialize
// the real Firebase app.
jest.mock("@/lib/firebase/gc-fitness-client", () => ({
  getGCFitnessAuth: jest.fn(() => ({ app: {} })),
}));

import { snapToRow } from "../exercises-listener";

type FakeSnap = {
  id: string;
  data: () => Record<string, unknown>;
};

function makeSnap(id: string, data: Record<string, unknown>): FakeSnap {
  return { id, data: () => data };
}

const BASE_DATA = {
  name: { en: "Test Exercise", es: "Ejercicio de prueba" },
  description: { en: "", es: "" },
  muscleGroups: ["legs"],
  equipment: ["barbell"],
  ownerId: "system",
  version: 1,
  // Use plain ISO strings to avoid Firestore Timestamp shape — snapToRow
  // accepts string-shaped time fields via its `toIso` fallback.
  updatedAt: "2026-05-22T00:00:00Z",
  createdAt: "2026-05-22T00:00:00Z",
};

describe("snapToRow source discrimination (260522-mo2 Revision fix #1)", () => {
  it("Case 1 — fexd source: source: 'free-exercise-db' round-trips correctly (NOT coerced to 'trainer')", () => {
    const snap = makeSnap("fexd-Bodyweight_Squat", {
      ...BASE_DATA,
      source: "free-exercise-db",
      gifUrl: "https://firebasestorage.googleapis.com/.../preview.gif?alt=media&token=tok",
      imageUrl: "https://firebasestorage.googleapis.com/.../start.jpg?alt=media&token=tok",
      endImageUrl: "https://firebasestorage.googleapis.com/.../end.jpg?alt=media&token=tok",
      instructions: { en: ["Stand."], es: ["De pie."] },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = snapToRow(snap as any);
    expect(row.source).toBe("free-exercise-db");
    expect(row.source).not.toBe("trainer");
    expect(row.source).not.toBe("wger");
    expect(row.gifUrl).toMatch(/preview\.gif/);
    expect(row.imageUrl).toMatch(/start\.jpg/);
    expect(row.endImageUrl).toMatch(/end\.jpg/);
    expect(row.instructions?.en?.[0]).toBe("Stand.");
    expect(row.instructions?.es?.[0]).toBe("De pie.");
  });

  it("Case 2 — wger source: source: 'wger' returns 'wger'", () => {
    const snap = makeSnap("wger-aaaa1111", { ...BASE_DATA, source: "wger" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = snapToRow(snap as any);
    expect(row.source).toBe("wger");
  });

  it("Case 3 — trainer source: source: 'trainer' returns 'trainer'", () => {
    const snap = makeSnap("custom-trainer-xxx", { ...BASE_DATA, source: "trainer" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = snapToRow(snap as any);
    expect(row.source).toBe("trainer");
  });

  it("Case 4 — unknown source: falls back to 'trainer' (conservative default)", () => {
    const snap = makeSnap("legacy-zzz", {
      ...BASE_DATA,
      source: "some-future-source-value",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = snapToRow(snap as any);
    expect(row.source).toBe("trainer");
  });

  it("BACKWARD COMPAT — when source is undefined, falls back to 'trainer'", () => {
    const snap = makeSnap("untyped-doc", BASE_DATA);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = snapToRow(snap as any);
    expect(row.source).toBe("trainer");
  });

  it("instructions handles missing/null fields gracefully", () => {
    const snap = makeSnap("no-instructions", { ...BASE_DATA, source: "wger" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = snapToRow(snap as any);
    expect(row.instructions).toBeNull();
    expect(row.gifUrl).toBeNull();
    expect(row.imageUrl).toBeNull();
    expect(row.endImageUrl).toBeNull();
    expect(row.deletedReason).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase 24-06 — 6 new FEXD enrichment fields on ExerciseRow + snapToRow.
// snapToRow must be defensive: an absent field decodes to a safe default
// ([] for arrays, null for strings) — never throws, never coerces "wger"
// into an Exercise.primaryMuscles string. The forgiving reads mirror the
// existing pattern at lines 163-182 of exercises-listener.ts.
// ---------------------------------------------------------------------------

describe("snapToRow Phase 24-06 enrichment fields", () => {
  it("Phase 24 case 1: doc lacking the 6 new fields returns []/null defaults", () => {
    const snap = makeSnap("legacy-wger-doc", {
      ...BASE_DATA,
      source: "wger",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = snapToRow(snap as any);
    expect(row.primaryMuscles).toEqual([]);
    expect(row.secondaryMuscles).toEqual([]);
    expect(row.mechanic).toBeNull();
    expect(row.level).toBeNull();
    expect(row.category).toBeNull();
    expect(row.force).toBeNull();
  });

  it("Phase 24 case 2: doc with all 6 populated returns correct typed values", () => {
    const snap = makeSnap("fexd-Bench_Press", {
      ...BASE_DATA,
      source: "free-exercise-db",
      primaryMuscles: ["chest"],
      secondaryMuscles: ["triceps", "shoulders"],
      mechanic: "compound",
      level: "intermediate",
      category: "strength",
      force: "push",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = snapToRow(snap as any);
    expect(row.primaryMuscles).toEqual(["chest"]);
    expect(row.secondaryMuscles).toEqual(["triceps", "shoulders"]);
    expect(row.mechanic).toBe("compound");
    expect(row.level).toBe("intermediate");
    expect(row.category).toBe("strength");
    expect(row.force).toBe("push");
  });

  it("Phase 24 case 3: malformed primaryMuscles (string instead of array) defensively returns []", () => {
    const snap = makeSnap("malformed-doc", {
      ...BASE_DATA,
      source: "free-exercise-db",
      // primaryMuscles arrives as a STRING (wire-shape regression). The
      // defensive Array.isArray guard MUST nil-default to [] rather than
      // coercing the string into the row.
      primaryMuscles: "chest",
      secondaryMuscles: 42,
      mechanic: 17,
      level: false,
      category: { en: "strength" },
      force: ["push"],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = snapToRow(snap as any);
    expect(row.primaryMuscles).toEqual([]);
    expect(row.secondaryMuscles).toEqual([]);
    expect(row.mechanic).toBeNull();
    expect(row.level).toBeNull();
    expect(row.category).toBeNull();
    expect(row.force).toBeNull();
  });
});
