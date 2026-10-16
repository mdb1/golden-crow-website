#!/usr/bin/env node
// test-gate.mjs — the Jest step of `npm run build`, sized to the change (#451).
//
// Running all ~5,300 tests made every backoffice deploy ~11 min on Vercel's
// 2-core builder (≈10 of them Jest). The deps check, `next build` and the
// runtime smoke (the checks that caught the 2026-10-15 login outage) still run
// on EVERY deploy; this decides how much of Jest the change justifies.
//
// The base of the diff is the last commit that PASSED on Vercel, remembered in
// the build cache (.next/cache — Vercel restores it only from a successful
// deployment), not HEAD^: a cancelled or failed deploy in between can't hide
// its changes. Plan logic (unit tested) lives in test-gate-plan.cjs:
//   full    — deps/config/test-utils changed, no known base, or weekly
//   related — jest --findRelatedTests <changed> + every test that reads the
//             filesystem or spawns processes (invisible to the import graph)
//   skip    — only inert files changed
//
// Local builds run the full suite. TEST_GATE=full forces it anywhere;
// TEST_GATE=related tries the Vercel plan locally.

import { spawnSync, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { planTests } = require("./test-gate-plan.cjs");

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = path.join(ROOT, ".next", "cache");
const CACHE_FILE = path.join(CACHE_DIR, "gc-test-gate.json");
const JEST_ARGS = ["--ci", "--silent", "--testTimeout=30000"];

const log = (msg) => console.log(`[test-gate] ${msg}`);
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function headSha() {
  try {
    return git("rev-parse", "HEAD");
  } catch {
    return null;
  }
}

/** backoffice-relative paths changed between `base` and HEAD, or null. */
function changedSince(base) {
  try {
    git("cat-file", "-e", `${base}^{commit}`);
    const out = git("diff", "--name-only", "--relative", base, "HEAD", "--", ".");
    return out ? out.split("\n") : [];
  } catch {
    return null;
  }
}

/** Tests the import graph can't link to a change: they read files or spawn processes. */
function filesystemTests() {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.test\.tsx?$/.test(entry.name) && full.includes(`${path.sep}__tests__${path.sep}`)) {
        const src = fs.readFileSync(full, "utf8");
        if (/readFileSync|readdirSync|node:fs|["']fs["']|child_process|spawnSync|execSync/.test(src)) {
          found.push(path.relative(ROOT, full));
        }
      }
    }
  };
  walk(path.join(ROOT, "src"));
  walk(path.join(ROOT, "scripts"));
  return found;
}

function runJest(extraArgs) {
  const r = spawnSync(process.execPath, [require.resolve("jest/bin/jest"), ...JEST_ARGS, ...extraArgs], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "test" },
  });
  return r.status ?? 1;
}

const cache = readCache();
const head = headSha();
const onVercel = Boolean(process.env.VERCEL);
const forced = ["full", "related"].includes(process.env.TEST_GATE) ? process.env.TEST_GATE : null;
const changed = cache.lastGreenSha ? changedSince(cache.lastGreenSha) : null;
const plan = planTests({
  forced,
  onVercel,
  baseKnown: Boolean(cache.lastGreenSha) && changed !== null,
  changed,
  lastFullAt: typeof cache.lastFullAt === "number" ? cache.lastFullAt : null,
  now: Date.now(),
});

log(`base ${cache.lastGreenSha?.slice(0, 8) ?? "none"} → head ${head?.slice(0, 8) ?? "?"}: ${plan.mode} (${plan.reason})`);

let status = 0;
if (plan.mode === "full") {
  status = runJest([]);
} else if (plan.mode === "related") {
  const existing = plan.files.filter((f) => fs.existsSync(path.join(ROOT, f)));
  const always = filesystemTests();
  log(`related to: ${existing.join(", ") || "(only deletions)"}; plus ${always.length} filesystem test(s)`);
  // --passWithNoTests: a changed file no test imports is a legitimate empty set.
  status = runJest(["--passWithNoTests", "--findRelatedTests", ...existing, ...always]);
}

if (status !== 0) process.exit(status);

// Only reached when everything in `build` before us and this step passed; the
// cache itself is uploaded only for a successful deployment.
if (head) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(
    CACHE_FILE,
    JSON.stringify({
      lastGreenSha: head,
      lastFullAt: plan.mode === "full" ? Date.now() : cache.lastFullAt ?? null,
    }),
  );
}
