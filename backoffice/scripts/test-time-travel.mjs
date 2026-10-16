#!/usr/bin/env node
// test-time-travel.mjs — time-bomb detector (#451). `npm run test:time-travel`.
//
// Vercel's production build runs the whole Jest suite, so a test that only
// passes "today" blocks every deploy the day it expires (2026-10-16: 72 CRM
// tests went red at 07:00Z because fixtures hard-coded quota timestamps).
//
// Runs the suite once unshifted and then with `Date` moved by each shift in
// SHIFTS (see jest.setup.ts → TEST_CLOCK_SHIFT_DAYS; timers stay real), and
// reports the tests that fail ONLY when shifted. Sequential on purpose: the
// jsdom suites are timeout-sensitive under CPU pressure.
//
// Extra args go straight to jest, e.g.
//   npm run test:time-travel -- src/components/god-mode
// Env: TIME_TRAVEL_SHIFTS="1,40,400,-1" overrides the shifts.
// Exit code 1 when any test fails only when shifted.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SHIFTS = (process.env.TIME_TRAVEL_SHIFTS ?? "1,40,400,-1")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n !== 0);
const jestArgs = process.argv.slice(2);
const cwd = process.cwd();
const jestBin = path.join(cwd, "node_modules", ".bin", "jest");
const outDir = mkdtempSync(path.join(tmpdir(), "time-travel-"));

function run(shiftDays) {
  const label = shiftDays === 0 ? "unshifted" : `${shiftDays > 0 ? "+" : ""}${shiftDays}d`;
  const outFile = path.join(outDir, `${label}.json`);
  const env = { ...process.env, NODE_ENV: "test" };
  if (shiftDays === 0) delete env.TEST_CLOCK_SHIFT_DAYS;
  else env.TEST_CLOCK_SHIFT_DAYS = String(shiftDays);
  const started = Date.now();
  process.stdout.write(`▶ jest ${label} … `);
  const res = spawnSync(
    jestBin,
    ["--ci", "--silent", "--json", `--outputFile=${outFile}`, ...jestArgs],
    { cwd, env, stdio: ["ignore", "ignore", "pipe"], encoding: "utf8", maxBuffer: 1 << 30 },
  );
  let report;
  try {
    report = JSON.parse(readFileSync(outFile, "utf8"));
  } catch {
    console.log("no JSON report");
    console.error(res.stderr?.slice(-4000));
    process.exit(2);
  }
  const failed = new Set();
  for (const file of report.testResults) {
    const rel = path.relative(cwd, file.name);
    const failedAssertions = file.assertionResults.filter((a) => a.status === "failed");
    for (const a of failedAssertions) failed.add(`${rel} › ${a.fullName}`);
    // A suite that crashes before running (import-time throw) has no assertions.
    if (file.status === "failed" && failedAssertions.length === 0) {
      failed.add(`${rel} › (suite failed to run)`);
    }
  }
  console.log(
    `${report.numPassedTests} passed, ${report.numFailedTests} failed, ` +
      `${report.numFailedTestSuites} failed suites (${Math.round((Date.now() - started) / 1000)} s)`,
  );
  return { label, failed };
}

const baseline = run(0);
const bombs = new Map(); // test → [labels]
for (const shift of SHIFTS) {
  const { label, failed } = run(shift);
  for (const t of failed) {
    if (baseline.failed.has(t)) continue;
    bombs.set(t, [...(bombs.get(t) ?? []), label]);
  }
}
rmSync(outDir, { recursive: true, force: true });

if (baseline.failed.size > 0) {
  console.log(`\n${baseline.failed.size} test(s) already fail unshifted (not time bombs):`);
  for (const t of baseline.failed) console.log(`  · ${t}`);
}
if (bombs.size === 0) {
  console.log(`\n✔ No time bombs: nothing fails only when Date is shifted by ${SHIFTS.join(", ")} days.`);
  process.exit(0);
}
console.log(`\n✘ ${bombs.size} test(s) fail ONLY when Date is shifted (time bombs):`);
for (const [t, labels] of bombs) console.log(`  · [${labels.join(" ")}] ${t}`);
console.log(
  "\nFix the TEST: pin Date to the fixture's day (jest.useFakeTimers({ now, doNotFake: [...] }))\n" +
    "or derive fixture dates from Date.now(). Re-run one file with\n" +
    "  NODE_ENV=test TEST_CLOCK_SHIFT_DAYS=40 npx jest <file>",
);
process.exit(1);
