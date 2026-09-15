// exercises-listener-scope.test.ts
//
// The VIEWER SCOPE of #552 — which exercises a given coach may see at all.
//
// WHERE THIS USED TO LIVE. Until #1104 these cases drove `useExercisesQuery`
// through `renderHook` with the browser Firestore SDK mocked, because the hook
// did the filtering. The read moved to a Server Action (see
// `exercise-list-actions.ts`), so the filter moved with it, into the pure
// `projectExercisesForViewer`. Testing the rule where the rule lives means no
// jsdom, no React Query, and — the reason it matters — no way for the test to
// pass while the SERVER hands a coach somebody else's library.
//
// The rule has three cases and the middle one is the leak:
//
//   1. A library exercise (wger / free-exercise-db / standard) is visible to
//      every coach — it's shared catalog.
//   2. A `source: "trainer"` exercise is visible ONLY to the coach who owns
//      it. Another coach's authored exercise must never appear in a picker:
//      assigning it puts a stranger's prescription into a client's routine,
//      and it looks exactly like an exercise the coach forgot writing.
//   3. With no uid, NO trainer-authored exercise is visible. Failing open here
//      would show every coach's private library to an unidentified session.
//
// The curation soft-delete (`deletedAt`) is filtered in the same pass and
// tested alongside, because it is the other reason a row legitimately vanishes
// and the two are easy to confuse when one breaks.

import { projectExercisesForViewer } from "@/lib/gc-fitness/exercise-row";

/** A doc snapshot shaped the way both Firestore SDKs expose one. */
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

function visibleIds(
  viewerUid: string | null,
  docs: ReturnType<typeof doc>[],
): string[] {
  return projectExercisesForViewer(docs, viewerUid).map((r) => r.id);
}

describe("projectExercisesForViewer — the #552 viewer scope", () => {
  it("shows library exercises to every coach", () => {
    expect(visibleIds("trainer-1", [libraryDoc("1259", "Bench Press")])).toEqual(
      ["1259"],
    );
  });

  it("shows the coach their OWN authored exercise", () => {
    expect(
      visibleIds("trainer-1", [trainerDoc("mine", "My Curl", "trainer-1")]),
    ).toEqual(["mine"]);
  });

  it("HIDES another coach's authored exercise", () => {
    const ids = visibleIds("trainer-1", [
      trainerDoc("mine", "My Curl", "trainer-1"),
      trainerDoc("theirs", "Their Curl", "trainer-2"),
      libraryDoc("1259", "Bench Press"),
    ]);

    // Assigning a stranger's exercise puts their prescription into this
    // coach's client's routine, and reads as one the coach forgot writing.
    expect(ids.sort()).toEqual(["1259", "mine"]);
  });

  it("hides EVERY trainer-authored exercise when there is no uid", () => {
    const ids = visibleIds(null, [
      trainerDoc("mine", "My Curl", "trainer-1"),
      trainerDoc("theirs", "Their Curl", "trainer-2"),
      libraryDoc("1259", "Bench Press"),
    ]);

    // Failing open here shows every coach's private library to a session that
    // hasn't identified itself.
    //
    // #1104 NOTE: this case used to fire on a perfectly valid session. The uid
    // came from `auth.currentUser?.uid` — the BROWSER Firebase-Auth session,
    // which Brave on mobile evicts — so a signed-in coach could land here and
    // lose their own library. It now comes from the verified cookie token
    // server-side, which is why this case should only ever be reachable by a
    // genuinely unauthenticated caller.
    expect(ids).toEqual(["1259"]);
  });

  it("hides an ownerless doc that snapToRow coerced to 'trainer'", () => {
    // `snapToRow` coerces any unknown wire `source` to "trainer" — the 24
    // `standard_alias` docs land here with `ownerId: null`, so the ownership
    // comparison is what keeps them out rather than an equality on source.
    const ids = visibleIds("trainer-1", [
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

describe("projectExercisesForViewer — the curation soft-delete", () => {
  it("drops a doc with a deletedAt stamp", () => {
    const ids = visibleIds("trainer-1", [
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

  it("keeps a doc whose deletedAt field is ABSENT", () => {
    // The field is absent on the ~78 curation survivors, which is why the
    // filter is a client-side truthiness test and not a Firestore
    // `where("deletedAt", "==", null)` — that predicate does not match docs
    // missing the field, and it once emptied the whole picker.
    expect(visibleIds("trainer-1", [libraryDoc("1259", "Bench")])).toEqual([
      "1259",
    ]);
  });
});
