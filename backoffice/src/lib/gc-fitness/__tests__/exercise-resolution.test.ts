// exercise-resolution.test.ts — #451 regression net.
//
// `resolveExerciseDocsById` follows `mergedInto` chains so historical workout
// snapshots keep their old ids but render the canonical exercise. The cases
// that matter: chains, missing targets (dangling merges — see the
// exercise-mergedinto incident), cycles (must terminate), batching, and that
// the result stays keyed by the ORIGINAL id the caller asked for.

import { resolveExerciseDocsById } from "../exercise-resolution";

type Doc = Record<string, unknown>;

function fakeDb(docs: Record<string, Doc>) {
  const gets: string[] = [];
  const collections: string[] = [];
  const db = {
    collection(name: string) {
      collections.push(name);
      return {
        doc(id: string) {
          return {
            async get() {
              gets.push(id);
              const data = docs[id];
              return { id, exists: data !== undefined, data: () => data };
            },
          };
        },
      };
    },
  };
  return { db, gets, collections };
}

describe("resolveExerciseDocsById", () => {
  it("returns plain docs keyed by id, from the exercises collection", async () => {
    const { db, collections } = fakeDb({ a: { name: "A" }, b: { name: "B" } });
    const out = await resolveExerciseDocsById(db, ["a", "b"]);
    expect(Object.fromEntries(out)).toEqual({ a: { name: "A" }, b: { name: "B" } });
    expect(new Set(collections)).toEqual(new Set(["exercises"]));
  });

  it("omits ids whose doc does not exist", async () => {
    const { db } = fakeDb({ a: { name: "A" } });
    const out = await resolveExerciseDocsById(db, ["a", "ghost"]);
    expect([...out.keys()]).toEqual(["a"]);
  });

  it("dedupes ids and skips blank ones without fetching them", async () => {
    const { db, gets } = fakeDb({ a: { name: "A" } });
    await resolveExerciseDocsById(db, ["a", "a", "", "   "]);
    expect(gets).toEqual(["a"]);
  });

  it("follows a merge to the canonical doc, keyed by the ORIGINAL id", async () => {
    const { db } = fakeDb({
      old: { name: "Old", mergedInto: "std-1" },
      "std-1": { name: "Canonical" },
    });
    const out = await resolveExerciseDocsById(db, ["old"]);
    expect(out.get("old")).toEqual({ name: "Canonical" });
    expect(out.has("std-1")).toBe(false);
  });

  it("follows a multi-hop chain to its terminal doc", async () => {
    const { db } = fakeDb({
      a: { mergedInto: "b" },
      b: { mergedInto: "c" },
      c: { mergedInto: "d" },
      d: { name: "D" },
    });
    const out = await resolveExerciseDocsById(db, ["a", "c"]);
    expect(out.get("a")).toEqual({ name: "D" });
    expect(out.get("c")).toEqual({ name: "D" });
  });

  it("trims a padded mergedInto and ignores a blank / non-string one", async () => {
    const { db } = fakeDb({
      a: { name: "A", mergedInto: "  b  " },
      b: { name: "B" },
      c: { name: "C", mergedInto: "   " },
      d: { name: "D", mergedInto: 42 },
    });
    const out = await resolveExerciseDocsById(db, ["a", "c", "d"]);
    expect(out.get("a")).toEqual({ name: "B" });
    expect(out.get("c")?.name).toBe("C");
    expect(out.get("d")?.name).toBe("D");
  });

  it("falls back to the ORIGINAL doc when the merge target is missing (dangling merge)", async () => {
    const { db } = fakeDb({ a: { name: "A", mergedInto: "gone" } });
    const out = await resolveExerciseDocsById(db, ["a"]);
    expect(out.get("a")).toEqual({ name: "A", mergedInto: "gone" });
  });

  it("falls back to the ORIGINAL doc when a chain dangles midway (a → b → missing)", async () => {
    // resolveTerminal answers the missing id, whose data is null, so the lookup
    // falls back to the doc the caller asked for — never to nothing.
    const { db } = fakeDb({
      a: { name: "A", mergedInto: "b" },
      b: { name: "B", mergedInto: "gone" },
    });
    const out = await resolveExerciseDocsById(db, ["a"]);
    expect(out.get("a")).toEqual({ name: "A", mergedInto: "b" });
  });

  it("terminates on a merge cycle and still returns a doc", async () => {
    const { db, gets } = fakeDb({
      a: { name: "A", mergedInto: "b" },
      b: { name: "B", mergedInto: "a" },
    });
    const out = await resolveExerciseDocsById(db, ["a"]);
    expect(out.has("a")).toBe(true);
    expect(gets.sort()).toEqual(["a", "b"]); // each doc fetched once
  });

  it("terminates on a self-merge", async () => {
    const { db } = fakeDb({ a: { name: "A", mergedInto: "a" } });
    const out = await resolveExerciseDocsById(db, ["a"]);
    expect(out.get("a")?.name).toBe("A");
  });

  it("fetches in batches of at most 20 and resolves every id to the shared target", async () => {
    const docs: Record<string, Doc> = { canon: { name: "Canon" } };
    const ids = Array.from({ length: 45 }, (_, i) => `e${i}`);
    for (const id of ids) docs[id] = { mergedInto: "canon" };
    let inFlight = 0;
    let maxInFlight = 0;
    const db = {
      collection: () => ({
        doc: (id: string) => ({
          async get() {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await Promise.resolve();
            inFlight -= 1;
            return { id, exists: id in docs, data: () => docs[id] };
          },
        }),
      }),
    };
    const out = await resolveExerciseDocsById(db, ids);
    expect(out.size).toBe(45);
    for (const id of ids) expect(out.get(id)).toEqual({ name: "Canon" });
    expect(maxInFlight).toBeLessThanOrEqual(20);
  });

  // Regression (#451): the `!fetched.has(target)` guard ran BEFORE the target
  // was fetched, so every doc in a batch merging into the same canonical id
  // re-enqueued it — 45 legacy ids cost 90 reads instead of 46 on every render
  // of a client's history. The queue now dedupes via a `queued` Set.
  it("reads a shared merge target only once", async () => {
    const docs: Record<string, Doc> = { canon: { name: "Canon" } };
    const ids = Array.from({ length: 45 }, (_, i) => `e${i}`);
    for (const id of ids) docs[id] = { mergedInto: "canon" };
    const { db, gets } = fakeDb(docs);
    await resolveExerciseDocsById(db, ids);
    expect(gets.filter((id) => id === "canon")).toHaveLength(1);
    expect(gets).toHaveLength(46);
  });

  it("treats an existing doc with no data as an empty doc", async () => {
    const db = {
      collection: () => ({
        doc: (id: string) => ({ get: async () => ({ id, exists: true, data: () => undefined }) }),
      }),
    };
    const out = await resolveExerciseDocsById(db, ["a"]);
    expect(out.get("a")).toEqual({});
  });

  it("returns an empty map for no ids", async () => {
    const { db, gets } = fakeDb({});
    expect((await resolveExerciseDocsById(db, [])).size).toBe(0);
    expect(gets).toEqual([]);
  });
});
