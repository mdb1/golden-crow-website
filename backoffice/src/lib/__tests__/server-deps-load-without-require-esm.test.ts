// server-deps-load-without-require-esm.test.ts
//
// 2026-10-15 incident: the dependency bump (#439) took firebase-admin to 14,
// whose jwks-rsa 4 does `require("jose")` — and jose 6 is ESM-only. Locally
// (Node 24) require(esm) just works, every test and `next build` were green,
// and production answered 500 on every signed-in page:
//
//   Failed to load external module firebase-admin/auth:
//   Error [ERR_REQUIRE_ESM]: require() of ES Module …/jose/dist/webapi/index.js
//   from …/jwks-rsa/src/utils.js not supported.
//
// The Vercel function runtime refuses require(esm). This test loads the
// server-only packages the way it does — with `--no-experimental-require-module`
// — so a dependency that only works thanks to require(esm) fails HERE.
// (Verified: with firebase-admin 14 this test fails with the same error.)

import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.join(__dirname, "..", "..", "..");

// Packages loaded on the server at runtime (externals Next does not bundle).
const SERVER_MODULES = [
  "firebase-admin/app",
  "firebase-admin/auth",
  "firebase-admin/firestore",
  "firebase-admin/storage",
  "firebase-admin/messaging",
  "next-firebase-auth-edge",
  "nodemailer",
];

it.each(SERVER_MODULES)("%s loads without require(esm)", (moduleName) => {
  const result = spawnSync(
    process.execPath,
    ["--no-experimental-require-module", "-e", `require(${JSON.stringify(moduleName)})`],
    { cwd: ROOT, encoding: "utf8" },
  );
  expect(result.stderr).not.toMatch(/ERR_REQUIRE_ESM|ERR_REQUIRE_ASYNC_MODULE/);
  expect(result.status).toBe(0);
});
