// test-gate-plan.cjs — which Jest run does this deploy need? (#451)
//
// Pure decision logic for scripts/test-gate.mjs, kept separate so it is unit
// tested (scripts/__tests__/test-gate-plan.test.ts). The runner gathers the
// facts (git diff against the last commit that passed on Vercel, the cache
// state, the clock); this file turns them into one of three plans:
//
//   full     — the whole suite
//   related  — `jest --findRelatedTests <changed files>` + the tests that read
//              the filesystem (they see source through fs, not imports, so the
//              dependency graph can't connect them to a change)
//   skip     — nothing that a test can observe changed (docs, scripts with no
//              test, backups, the version bump)
//
// The bias is always toward MORE testing: any doubt → full.

/** Changes that can alter the outcome of ANY test — they force the full suite. */
const FULL_TRIGGERS = [
  /^package(-lock)?\.json$/,
  /^jest\.(config|setup)\./,
  /^tsconfig[^/]*\.json$/,
  /^next\.config\./,
  /^\.swcrc$/,
  /^src\/lib\/test-utils\//,
  /^src\/types\//,
  /(^|\/)[^/]*\.d\.ts$/,
  /^scripts\/test-gate(-plan)?\./,
];

/** Changes no test can observe — on their own they skip Jest. */
const INERT = [
  /\.md$/,
  /^scripts\/backups\//,
  /^src\/lib\/app-version\.ts$/,
  /^public\//,
];

const FULL_RUN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RELATED_FILES = 150;

/**
 * @param {{
 *   forced?: "full" | "related" | null,
 *   onVercel: boolean,
 *   baseKnown: boolean,          // the last-green commit exists in this clone
 *   changed: string[] | null,    // backoffice-relative paths; null = diff failed
 *   lastFullAt: number | null,   // ms epoch of the last full run that passed
 *   now: number,
 * }} facts
 * @returns {{ mode: "full" | "related" | "skip", reason: string, files: string[] }}
 */
function planTests(facts) {
  const full = (reason) => ({ mode: "full", reason, files: [] });
  if (facts.forced === "full") return full("TEST_GATE=full");
  if (!facts.onVercel && facts.forced !== "related") {
    return full("local build — the full suite (set TEST_GATE=related to try the Vercel plan)");
  }
  if (!facts.baseKnown || facts.changed === null) {
    return full("no last-green commit to diff against");
  }
  if (facts.lastFullAt === null || facts.now - facts.lastFullAt > FULL_RUN_MAX_AGE_MS) {
    return full("weekly full run (last one over 7 days ago, or never)");
  }
  const trigger = facts.changed.find((f) => FULL_TRIGGERS.some((re) => re.test(f)));
  if (trigger) return full(`${trigger} changed — it can affect any test`);
  if (facts.changed.length > MAX_RELATED_FILES) {
    return full(`${facts.changed.length} files changed`);
  }
  const relevant = facts.changed.filter((f) => !INERT.some((re) => re.test(f)));
  if (relevant.length === 0) {
    return {
      mode: "skip",
      reason: facts.changed.length
        ? `only inert files changed (${facts.changed.join(", ")})`
        : "nothing under backoffice/ changed since the last green build",
      files: [],
    };
  }
  return {
    mode: "related",
    reason: `${relevant.length} changed file(s)`,
    files: relevant,
  };
}

module.exports = { planTests, FULL_TRIGGERS, INERT, FULL_RUN_MAX_AGE_MS, MAX_RELATED_FILES };
