// test-gate-plan.test.ts — #451: how much of Jest a Vercel deploy runs.
//
// The dangerous direction is a false "skip"/"related" — a change that should
// have run a test that didn't, which is the exact way a regression reaches
// production with the build green. So most cases here pin when the plan must
// fall back to the FULL suite.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { planTests, FULL_RUN_MAX_AGE_MS, MAX_RELATED_FILES } = require("../test-gate-plan.cjs");

const NOW = Date.parse("2026-10-16T12:00:00Z");
const recentFull = NOW - 60 * 60 * 1000;
const base = {
  forced: null,
  onVercel: true,
  baseKnown: true,
  changed: [] as string[] | null,
  lastFullAt: recentFull as number | null,
  now: NOW,
};
const plan = (over: Partial<typeof base>) => planTests({ ...base, ...over });

describe("planTests — falls back to the full suite on any doubt", () => {
  it("local builds always run everything", () => {
    expect(plan({ onVercel: false, changed: ["src/lib/a.ts"] }).mode).toBe("full");
  });

  it("TEST_GATE=full forces it on Vercel", () => {
    expect(plan({ forced: "full", changed: ["README.md"] }).mode).toBe("full");
  });

  it("TEST_GATE=related lets a local build try the Vercel plan", () => {
    expect(plan({ onVercel: false, forced: "related", changed: ["src/lib/a.ts"] }).mode).toBe("related");
  });

  it("no known last-green commit (first build, cache lost, base beyond the clone)", () => {
    expect(plan({ baseKnown: false, changed: null }).mode).toBe("full");
    expect(plan({ changed: null }).mode).toBe("full");
  });

  it("weekly: never ran full, or the last full run is older than 7 days", () => {
    expect(plan({ lastFullAt: null, changed: ["src/lib/a.ts"] }).mode).toBe("full");
    expect(plan({ lastFullAt: NOW - FULL_RUN_MAX_AGE_MS - 1, changed: ["src/lib/a.ts"] }).mode).toBe("full");
    expect(plan({ lastFullAt: NOW - FULL_RUN_MAX_AGE_MS + 60_000, changed: ["src/lib/a.ts"] }).mode).toBe("related");
  });

  it.each([
    "package.json",
    "package-lock.json",
    "jest.config.js",
    "jest.setup.ts",
    "tsconfig.json",
    "tsconfig.vercel.json",
    "next.config.ts",
    "src/lib/test-utils/fake-firestore-c.ts",
    "src/types/next-auth.d.ts",
    "scripts/test-gate.mjs",
    "scripts/test-gate-plan.cjs",
  ])("%s changing anywhere in the diff forces full", (file) => {
    expect(plan({ changed: ["src/lib/a.ts", file] }).mode).toBe("full");
  });

  it("a very large diff runs full", () => {
    const many = Array.from({ length: MAX_RELATED_FILES + 1 }, (_, i) => `src/lib/f${i}.ts`);
    expect(plan({ changed: many }).mode).toBe("full");
  });
});

describe("planTests — related and skip", () => {
  it("source changes run the related tests, inert files dropped from the list", () => {
    const p = plan({ changed: ["src/lib/gc-fitness/decimal-input.ts", "README.md", "src/lib/app-version.ts"] });
    expect(p.mode).toBe("related");
    expect(p.files).toEqual(["src/lib/gc-fitness/decimal-input.ts"]);
  });

  it("a changed script is related too (scripts have tests)", () => {
    expect(plan({ changed: ["scripts/vercel-ignore-build.sh"] }).mode).toBe("related");
  });

  it("only docs, backups, the version bump or public assets → skip", () => {
    const p = plan({
      changed: ["README.md", "scripts/backups/x.json", "src/lib/app-version.ts", "public/logo.png"],
    });
    expect(p.mode).toBe("skip");
  });

  it("nothing changed since the last green build → skip", () => {
    expect(plan({ changed: [] }).mode).toBe("skip");
  });
});
