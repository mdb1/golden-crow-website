// typecheck.test.ts
//
// Type-checks the scripts and their tests as part of the test run. Until TypeScript 7, ts-jest
// compiled every test with the type checker on; TS 7 (the native compiler)
// dropped the JS API ts-jest needs, so Jest now runs through SWC, which only
// strips types. Without this, a mistyped mock or fixture would pass silently.

import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.join(__dirname, "..");

it("type-checks (tsc --noEmit)", () => {
  // TS 7's package.json `exports` hides bin/, so run the installed bin link.
  const tsc = path.join(ROOT, "node_modules", ".bin", "tsc");
  const result = spawnSync(tsc, ["--noEmit"], { cwd: ROOT, encoding: "utf8" });
  const errors = `${result.stdout}${result.stderr}`
    .split("\n")
    .filter((line) => line.includes("error TS"));
  expect(errors).toEqual([]);
  expect(result.status).toBe(0);
}, 180_000);
