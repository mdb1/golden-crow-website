// bump-sidebar-version.test.ts
//
// #382 — `.githooks/pre-commit` bumps the visible backoffice version, and
// `scripts/vercel-ignore-build.sh` redeploys production for any change under
// `backoffice/`. If the hook bumped on EVERY commit, a pocket-genes-only commit
// would redeploy the backoffice and rotate every Server Action ID under the
// forms coaches have open. So the hook bumps only when the commit really ships
// backoffice code.
//
// Each case builds a throwaway repo with the REAL hook and the REAL bump script
// installed, and commits through git — so what's asserted is the commit the
// hook actually produced, and whether Vercel would build it.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const HOOK = path.join(REPO_ROOT, ".githooks", "pre-commit");
const BUMP = path.join(__dirname, "..", "bump-sidebar-version.py");
const IGNORE_BUILD = path.join(__dirname, "..", "vercel-ignore-build.sh");
const VERSION_FILE = "backoffice/src/lib/app-version.ts";

/** Vercel's exit codes, which are the opposite of intuition. */
const SKIP_BUILD = 0;
const RUN_BUILD = 1;

let repo: string;

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" });
}

function write(relative: string, contents: string): void {
  const full = path.join(repo, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
}

/** Commits through git so the pre-commit hook runs, like on a dev machine. */
function commit(message: string): void {
  git("add", "-A");
  git("commit", "-q", "-m", message);
}

function version(): string {
  return fs.readFileSync(path.join(repo, VERSION_FILE), "utf8");
}

function filesInHead(): string[] {
  return git("show", "--name-only", "--format=", "HEAD").trim().split("\n");
}

/** Runs the Ignored Build Step the way Vercel does, from the Root Directory. */
function vercelDecision(): number {
  const result = spawnSync("bash", [IGNORE_BUILD], {
    cwd: path.join(repo, "backoffice"),
    env: { ...process.env, VERCEL_ENV: "production" },
    encoding: "utf8",
  });
  return result.status ?? -1;
}

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "bump-version-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  write("backoffice/package.json", JSON.stringify({ name: "backoffice" }));
  write(VERSION_FILE, 'export const BACKOFFICE_VERSION = "3.100";\n');
  write("backoffice/scripts/bump-sidebar-version.py", fs.readFileSync(BUMP, "utf8"));
  write(".githooks/pre-commit", fs.readFileSync(HOOK, "utf8"));
  fs.chmodSync(path.join(repo, ".githooks", "pre-commit"), 0o755);
  write("pocket-genes/index.astro", "<html></html>");
  commit("initial");
  git("config", "core.hooksPath", ".githooks");
});

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe("pre-commit version bump", () => {
  it("BUMPS when the commit changes backoffice code — and Vercel builds it", () => {
    write("backoffice/src/app/page.tsx", "export default () => null;");
    commit("a real backoffice change");

    expect(version()).toContain('"3.101"');
    expect(filesInHead()).toContain(VERSION_FILE);
    expect(vercelDecision()).toBe(RUN_BUILD);
  });

  it("does NOT bump a pocket-genes-only commit — and Vercel skips it", () => {
    // The 2026-10 shape that kept rotating action IDs: five pocket-genes
    // commits in a row, each carrying only the version bump under backoffice/.
    write("pocket-genes/index.astro", "<html>new copy</html>");
    commit("fix(pocket-genes): refine homepage hero copy");

    expect(version()).toContain('"3.100"');
    expect(filesInHead()).toEqual(["pocket-genes/index.astro"]);
    expect(vercelDecision()).toBe(SKIP_BUILD);
  });

  it("BUMPS when backoffice changed alongside marketing", () => {
    write("pocket-genes/index.astro", "<html>new copy</html>");
    write("backoffice/src/components/discover/x.tsx", "export const x = 1;");
    commit("Rename event publisher disclosure label");

    expect(version()).toContain('"3.101"');
    expect(vercelDecision()).toBe(RUN_BUILD);
  });

  it("does not bump twice when the version file is already staged", () => {
    // A hand-edited version (or a re-run hook) must not count as a backoffice
    // change by itself, or the bump would feed itself.
    write(VERSION_FILE, 'export const BACKOFFICE_VERSION = "4.0";\n');
    commit("manual major bump");

    expect(version()).toContain('"4.0"');
  });
});
