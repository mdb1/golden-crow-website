// server-deps-load-without-require-esm.test.ts
//
// 2026-10-15: firebase-admin 14 → jwks-rsa 4 → `require("jose")`, and jose 6 is
// ESM-only. Node 24 tolerates that locally (require(esm)); the Vercel function
// runtime does not — the backoffice answered 500 on every signed-in page with
// `ERR_REQUIRE_ESM … jose … from jwks-rsa`. This SDK verifies Firebase ID
// tokens through the same path, so it loads its server packages here with
// `--no-experimental-require-module`, the way that runtime does.

import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.join(__dirname, "..", "..");

const SERVER_MODULES = [
  "firebase-admin/app",
  "firebase-admin/auth",
  "firebase-admin/firestore",
  "firebase-admin/storage",
  "fastify",
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
