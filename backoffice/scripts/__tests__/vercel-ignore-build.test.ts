// vercel-ignore-build.test.ts
//
// #382 — the Ignored Build Step that decides whether a push to `main`
// redeploys the backoffice.
//
// WHY THIS IS TESTED AT ALL. Both of its failure modes are silent:
//
//   • Too eager to SKIP → the backoffice quietly stops shipping. Every deploy
//     looks fine, nothing turns red, and the bug is only found when someone
//     notices a merged change never went live.
//   • Too eager to SKIP → the operator-visible version lags behind the pushed
//     version and can no longer prove which release is running.
//
// Each case builds a throwaway git repo so the assertions are about real git
// behavior — pathspecs, exit codes, a missing HEAD^ — rather than a mock of it.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPT = path.join(__dirname, "..", "vercel-ignore-build.sh");

/** Vercel's exit codes, which are the opposite of intuition. */
const SKIP_BUILD = 0;
const RUN_BUILD = 1;

let repo: string;

function git(...args: string[]): void {
  execFileSync("git", args, { cwd: repo, stdio: "pipe" });
}

function write(relative: string, contents: string): void {
  const full = path.join(repo, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
}

function commit(message: string): void {
  git("add", "-A");
  git("commit", "-q", "-m", message);
}

/** Runs the script the way Vercel does: from the project's Root Directory. */
function run(
  env: Record<string, string> = { VERCEL_ENV: "production" },
  cwd = path.join(repo, "backoffice"),
): number {
  const result = spawnSync("bash", [SCRIPT], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  return result.status ?? -1;
}

/** The file `.githooks/pre-commit` rewrites on every commit, repo-wide. */
let versionCounter = 100;
function bumpVersionCounter(): void {
  versionCounter += 1;
  write(
    "backoffice/src/lib/app-version.ts",
    `export const BACKOFFICE_VERSION = "3.${versionCounter}";\n`,
  );
}

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "ignore-build-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  // A minimal mirror of the real layout: the backoffice package the script
  // identifies itself by, plus a sibling the marketing site stands in for.
  write("backoffice/package.json", JSON.stringify({ name: "backoffice" }));
  bumpVersionCounter();
  write("pocket-genes/index.astro", "<html></html>");
  commit("initial");
});

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe("previews", () => {
  it("never builds — unchanged from the setting it replaces", () => {
    // The dashboard command was `if production; then exit 1; else exit 0; fi`.
    // Preserving the preview half matters: flipping it on would start building
    // every PR branch and quietly change what this project costs.
    write("backoffice/src/app/page.tsx", "export default () => null;");
    commit("a real backoffice change");

    expect(run({ VERCEL_ENV: "preview" })).toBe(SKIP_BUILD);
    expect(run({ VERCEL_ENV: "development" })).toBe(SKIP_BUILD);
  });
});

describe("production", () => {
  it("BUILDS when backoffice code changed", () => {
    write("backoffice/src/app/page.tsx", "export default () => null;");
    bumpVersionCounter();
    commit("a real backoffice change");

    expect(run()).toBe(RUN_BUILD);
  });

  it("BUILDS a marketing commit that bumps the visible version counter", () => {
    write("pocket-genes/index.astro", "<html>new copy</html>");
    bumpVersionCounter();
    commit("Use gray event preview section headings");

    expect(run()).toBe(RUN_BUILD);
  });

  it("BUILDS a commit that changes nothing but the version counter", () => {
    bumpVersionCounter();
    commit("bump only");

    expect(run()).toBe(RUN_BUILD);
  });

  it("BUILDS when backoffice changed alongside marketing", () => {
    // Two of the five 2026-09-14 commits are this shape — they touch
    // `backoffice/src/components/discover/`, a real surface of the same app.
    // They MUST redeploy; no path filter can avoid it.
    write("pocket-genes/index.astro", "<html>new copy</html>");
    write("backoffice/src/components/discover/x.tsx", "export const x = 1;");
    bumpVersionCounter();
    commit("Rename event publisher disclosure label");

    expect(run()).toBe(RUN_BUILD);
  });
});

describe("fail-safe: when in doubt, BUILD", () => {
  it("builds when there is no previous commit to diff against", () => {
    // A shallow clone, or the very first commit: `git diff HEAD^` fails with
    // 128. The dangerous reading of a failure is "nothing changed".
    const fresh = fs.mkdtempSync(path.join(os.tmpdir(), "ignore-build-first-"));
    const previous = repo;
    repo = fresh;
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    write("backoffice/package.json", JSON.stringify({ name: "backoffice" }));
    commit("the only commit");

    expect(run()).toBe(RUN_BUILD);

    fs.rmSync(fresh, { recursive: true, force: true });
    repo = previous;
  });

  it("builds when it is not running in the backoffice root", () => {
    // `git diff -- .` is relative to the working directory, so running from
    // the wrong place compares the wrong subtree — and the likely answer is a
    // confident, wrong "nothing changed" that never ships again.
    write("pocket-genes/index.astro", "<html>new copy</html>");
    bumpVersionCounter();
    commit("marketing only");

    expect(run({ VERCEL_ENV: "production" }, repo)).toBe(RUN_BUILD);
  });
});
