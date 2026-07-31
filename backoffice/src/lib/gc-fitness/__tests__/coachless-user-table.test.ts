// __tests__/coachless-user-table.test.ts
//
// Search + sort for the admin "Coach-less users" table (issue #606).

import type { CoachlessUserRow } from "@/lib/gc-fitness/admin-coachless-actions";
import {
  DEFAULT_COACHLESS_SORT,
  matchesCoachlessQuery,
  nextCoachlessSort,
  selectCoachlessRows,
} from "@/lib/gc-fitness/coachless-user-table";

function row(over: Partial<CoachlessUserRow> & { uid: string }): CoachlessUserRow {
  return {
    email: `${over.uid}@x.com`,
    displayName: over.uid,
    photoURL: null,
    createdAtISO: "2026-01-01T00:00:00.000Z",
    entitlement: null,
    stats: { routines: 0, habits: 0, progressPhotos: 0, workoutLogs: 0 },
    ...over,
  } as CoachlessUserRow;
}

const ROWS: CoachlessUserRow[] = [
  row({
    uid: "ana",
    displayName: "Ana Gómez",
    email: "ana@x.com",
    createdAtISO: "2026-06-10T10:00:00.000Z",
    stats: { routines: 3, habits: 1, progressPhotos: 0, workoutLogs: 12 },
  }),
  row({
    uid: "beto",
    displayName: "Beto Ruiz",
    email: "beto@x.com",
    createdAtISO: "2026-07-29T10:00:00.000Z",
    entitlement: {
      tier: "premium",
      source: "revenuecat",
      productId: null,
      expiresAtISO: null,
      updatedAtISO: null,
    },
    stats: { routines: 1, habits: 5, progressPhotos: 2, workoutLogs: 0 },
  }),
  row({
    uid: "carla",
    displayName: "",
    email: "9mgc9g@privaterelay.appleid.com",
    createdAtISO: null,
    stats: { routines: 0, habits: 0, progressPhotos: 7, workoutLogs: 3 },
  }),
];

describe("matchesCoachlessQuery", () => {
  it("matches name, email or uid, case- and accent-insensitively", () => {
    expect(matchesCoachlessQuery(ROWS[0], "gomez")).toBe(true);
    expect(matchesCoachlessQuery(ROWS[0], "ANA@")).toBe(true);
    expect(matchesCoachlessQuery(ROWS[2], "privaterelay")).toBe(true);
    expect(matchesCoachlessQuery(ROWS[2], "carla")).toBe(true); // uid
    expect(matchesCoachlessQuery(ROWS[1], "zzz")).toBe(false);
  });

  it("treats a blank query as no filter", () => {
    expect(matchesCoachlessQuery(ROWS[0], "   ")).toBe(true);
  });
});

describe("nextCoachlessSort", () => {
  it("flips the direction on the active column", () => {
    expect(nextCoachlessSort({ key: "logs", direction: "desc" }, "logs")).toEqual({
      key: "logs",
      direction: "asc",
    });
  });

  it("starts numeric columns descending and text columns ascending", () => {
    expect(nextCoachlessSort(DEFAULT_COACHLESS_SORT, "logs").direction).toBe("desc");
    expect(nextCoachlessSort(DEFAULT_COACHLESS_SORT, "user").direction).toBe("asc");
  });
});

describe("selectCoachlessRows", () => {
  it("defaults to newest signups first, with missing dates last", () => {
    const sorted = selectCoachlessRows(ROWS);
    expect(sorted.map((r) => r.uid)).toEqual(["beto", "ana", "carla"]);
  });

  it("sorts by a numeric column in both directions", () => {
    expect(
      selectCoachlessRows(ROWS, { sort: { key: "photos", direction: "desc" } }).map(
        (r) => r.uid,
      ),
    ).toEqual(["carla", "beto", "ana"]);
    expect(
      selectCoachlessRows(ROWS, { sort: { key: "logs", direction: "asc" } }).map(
        (r) => r.uid,
      ),
    ).toEqual(["beto", "carla", "ana"]);
  });

  it("sorts by user, falling back to the email when there is no display name", () => {
    expect(
      selectCoachlessRows(ROWS, { sort: { key: "user", direction: "asc" } }).map(
        (r) => r.uid,
      ),
    ).toEqual(["carla", "ana", "beto"]); // "9mgc9g@…" < "ana gomez" < "beto ruiz"
  });

  it("puts premium first when sorting by subscription", () => {
    const sorted = selectCoachlessRows(ROWS, {
      sort: { key: "subscription", direction: "desc" },
    });
    expect(sorted[0].uid).toBe("beto");
  });

  it("filters and sorts together, without mutating the input", () => {
    const before = ROWS.map((r) => r.uid);
    const sorted = selectCoachlessRows(ROWS, { query: "a", sort: DEFAULT_COACHLESS_SORT });
    expect(sorted.map((r) => r.uid)).toEqual(["ana", "carla"]);
    expect(ROWS.map((r) => r.uid)).toEqual(before);
  });
});
