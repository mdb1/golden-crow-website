// server-actions-contract.test.ts
//
// #382 — a deploy must not break the tabs coaches already have open.
//
// Next.js derives every Server Action's ID from the build key + its file + its
// export name (+ its argument shape). A tab opened before a deploy keeps
// posting the IDs it was rendered with. So when an action in use is renamed,
// moved, re-shaped or deleted, every such tab fails its next save with
// "Server Action … was not found" — or worse, before #438 inline closures were
// re-numbered and an old ID could run a DIFFERENT action.
//
// `server-actions.contract.json` lists every exported Server Action. This test
// fails whenever the source and the list disagree, so none of those changes
// can ship without someone looking at it:
//
//   • NEW action → just record it:  node scripts/server-actions-contract.cjs --write
//   • RENAMED / MOVED / RE-SHAPED / DELETED action in use → don't. Add the new
//     one NEXT TO the old one, deploy, and only in a later PR delete the old
//     one; `--write` then moves it to "retired" (with the date) for review.
//
// The real-build version of this check — both builds' IDs compared — is
// scripts/check-deploy-skew.sh.

import path from "node:path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const contract = require(path.join(__dirname, "..", "..", "..", "scripts", "server-actions-contract.cjs")) as {
  collectActions: () => { file: string; export: string; params: string }[];
  readContract: () => {
    actions: { file: string; export: string; params: string }[];
    retired?: { file: string; export: string; since: string }[];
  };
  diffContract: (
    current: { file: string; export: string; params: string }[],
    contract: { actions: { file: string; export: string; params: string }[] },
  ) => { removed: string[]; reshaped: string[]; added: string[] };
};

const current = contract.collectActions();
const recorded = contract.readContract();
const diff = contract.diffContract(current, recorded);

describe("Server Actions contract (#382)", () => {
  it("finds the actions at all (the scanner still works)", () => {
    expect(current.length).toBeGreaterThan(150);
    expect(current).toContainEqual(
      expect.objectContaining({
        file: "src/app/gc-fitness/admin/actions.ts",
        export: "promoteToAdminAction",
      }),
    );
  });

  it("no action that old tabs may call was removed, renamed or moved", () => {
    // Fix: keep the old export for one deploy. Only when it has been unused for
    // a deploy, delete it and run `node scripts/server-actions-contract.cjs --write`.
    expect(diff.removed).toEqual([]);
  });

  it("no action changed the shape of its arguments", () => {
    // An old tab posts the OLD arguments to the new code. Add a new action with
    // the new shape instead, keep the old one for a deploy.
    expect(diff.reshaped).toEqual([]);
  });

  it("every new action is recorded in the contract", () => {
    // Fix: `node scripts/server-actions-contract.cjs --write` (new actions are safe).
    expect(diff.added).toEqual([]);
  });

  it("retired actions are really gone and carry a date", () => {
    const live = new Set(current.map((a) => `${a.file}#${a.export}`));
    for (const r of recorded.retired ?? []) {
      expect(live.has(`${r.file}#${r.export}`)).toBe(false);
      expect(r.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
