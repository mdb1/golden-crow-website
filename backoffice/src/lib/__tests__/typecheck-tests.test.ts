// typecheck-tests.test.ts
//
// Type-checks the TEST files (and everything they import) as part of `npx jest`.
//
// Until TypeScript 7, ts-jest compiled every test with the type checker on, so
// a test that no longer matched the code it exercises failed `npx jest`. TS 7
// (the native compiler) dropped the JS API ts-jest needs, so tests now run
// through SWC, which only strips types — and `tsconfig.json` excludes
// `__tests__`, so `next build` never looks at them either. Without this file
// a mistyped mock or a stale fixture would pass every gate silently.

import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.join(__dirname, "..", "..", "..");

it("type-checks the test files (tsc -p tsconfig.jest.json)", () => {
  // TS 7's package.json `exports` hides bin/, so run the installed bin link.
  const tsc = path.join(ROOT, "node_modules", ".bin", "tsc");
  const result = spawnSync(tsc, ["-p", "tsconfig.jest.json", "--noEmit"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const errors = `${result.stdout}${result.stderr}`
    .split("\n")
    .filter((line) => line.includes("error TS"));
  expect(errors).toEqual([]);
  expect(result.status).toBe(0);
}, 180_000);
