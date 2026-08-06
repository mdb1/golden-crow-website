/**
 * @jest-environment jsdom
 */

// exercises-listener-scope.test.tsx
//
// The VIEWER SCOPE of #552 — which exercises a given coach may see at all.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it `renderHook` crashes
// with `ReferenceError: document is not defined`.
//
// #306 lists this as "extend exercise-picker-popover to the #552 viewer
// scope". It can't live there: the picker renders whatever `useExercisesQuery`
// hands it, and every picker test mocks that hook. The scope is enforced ONE
// LAYER DOWN, in the hook's own `canTrainerAccessExercise` filter, so that is
// where the test goes. What the picker DOES own — the legacy-retirement
// predicate and the selected-value fallback — is already covered in
// `components/gc-fitness/__tests__/exercise-picker-popover.test.tsx`.
//
// The rule has three cases and the middle one is the leak:
//
//   1. A library exercise (wger / free-exercise-db / standard) is visible to
//      every coach — it's shared catalog.
//   2. A `source: "trainer"` exercise is visible ONLY to the coach who owns
//      it. Another coach's authored exercise must never appear in a picker:
//      assigning it puts a stranger's prescription into a client's routine,
//      and it looks exactly like an exercise the coach forgot writing.
//   3. With no signed-in uid, NO trainer-authored exercise is visible. Failing
//      open here would show every coach's private library to an anonymous
//      session.
//
// The curation soft-delete (`deletedAt`) is filtered in the same pass and
// tested alongside, because it is the other reason a row legitimately vanishes
// and the two are easy to confuse when one breaks.

import "@testing-library/jest-dom";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";

const mockGetDocs = jest.fn();
jest.mock("firebase/firestore", () => ({
  getFirestore: () => ({}),
  collection: (...args: unknown[]) => ({ __collection: args[1] }),
  query: (...args: unknown[]) => ({ __query: args }),
  orderBy: (...args: unknown[]) => ({ __orderBy: args }),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
}));

jest.mock("@/lib/firebase/gc-fitness-client", () => ({
  getGCFitnessAuth: () => ({ app: {}, currentUser: null }),
}));

import { useExercisesQuery } from "@/lib/gc-fitness/exercises-listener";

/** A Firestore doc snapshot shaped the way `snapToRow` consumes it. */
function doc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

function libraryDoc(id: string, name: string) {
  return doc(id, {
    name: { en: name, es: "" },
    description: { en: "", es: "" },
    muscleGroups: ["chest"],
    equipment: ["barbell"],
    source: "wger",
    ownerId: null,
    tags: ["standard-library"],
    updatedAt: "2026-08-01T00:00:00.000Z",
  });
}

function trainerDoc(id: string, name: string, ownerId: string | null) {
  return doc(id, {
    name: { en: name, es: "" },
    description: { en: "", es: "" },
    muscleGroups: ["chest"],
    equipment: ["barbell"],
    source: "trainer",
    ownerId,
    updatedAt: "2026-08-01T00:00:00.000Z",
  });
}

async function loadFor(
  trainerUid: string | null,
  docs: ReturnType<typeof doc>[],
): Promise<string[]> {
  mockGetDocs.mockResolvedValue({ docs });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useExercisesQuery(trainerUid), {
    wrapper,
  });
  await waitFor(() => expect(result.current.isFetched).toBe(true));
  return (result.current.data ?? []).map((r) => r.id);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useExercisesQuery — the #552 viewer scope", () => {
  it("shows library exercises to every coach", async () => {
    const ids = await loadFor("trainer-1", [libraryDoc("1259", "Bench Press")]);

    expect(ids).toEqual(["1259"]);
  });

  it("shows the coach their OWN authored exercise", async () => {
    const ids = await loadFor("trainer-1", [
      trainerDoc("mine", "My Curl", "trainer-1"),
    ]);

    expect(ids).toEqual(["mine"]);
  });

  it("HIDES another coach's authored exercise", async () => {
    const ids = await loadFor("trainer-1", [
      trainerDoc("mine", "My Curl", "trainer-1"),
      trainerDoc("theirs", "Their Curl", "trainer-2"),
      libraryDoc("1259", "Bench Press"),
    ]);

    // Assigning a stranger's exercise puts their prescription into this
    // coach's client's routine, and reads as one the coach forgot writing.
    expect(ids.sort()).toEqual(["1259", "mine"]);
  });

  it("hides EVERY trainer-authored exercise when there is no uid", async () => {
    const ids = await loadFor(null, [
      trainerDoc("mine", "My Curl", "trainer-1"),
      trainerDoc("theirs", "Their Curl", "trainer-2"),
      libraryDoc("1259", "Bench Press"),
    ]);

    // Failing open here shows every coach's private library to a session that
    // hasn't identified itself.
    expect(ids).toEqual(["1259"]);
  });

  it("hides an ownerless doc that snapToRow coerced to 'trainer'", async () => {
    // `snapToRow` coerces any unknown wire `source` to "trainer" — the 24
    // `standard_alias` docs land here with `ownerId: null`, so the ownership
    // comparison is what keeps them out rather than an equality on source.
    const ids = await loadFor("trainer-1", [
      doc("alias-1", {
        name: { en: "Aliased", es: "" },
        description: { en: "", es: "" },
        muscleGroups: [],
        equipment: [],
        source: "standard_alias",
        ownerId: null,
        updatedAt: "2026-08-01T00:00:00.000Z",
      }),
      libraryDoc("1259", "Bench Press"),
    ]);

    expect(ids).toEqual(["1259"]);
  });
});

describe("useExercisesQuery — the curation soft-delete", () => {
  it("drops a doc with a deletedAt stamp", async () => {
    const ids = await loadFor("trainer-1", [
      doc("curated-out", {
        name: { en: "Superseded", es: "" },
        description: { en: "", es: "" },
        muscleGroups: [],
        equipment: [],
        source: "wger",
        ownerId: null,
        tags: ["standard-library"],
        deletedAt: "2026-06-12T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      }),
      libraryDoc("1259", "Bench Press"),
    ]);

    // A separate reason from the viewer scope for a row to vanish; when one
    // of the two breaks it is easy to blame the other.
    expect(ids).toEqual(["1259"]);
  });
});
