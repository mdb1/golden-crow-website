#!/usr/bin/env node
// check-server-deps.mjs — runs BEFORE the build, so Vercel refuses to deploy a
// dependency set its function runtime can't load.
//
// The Vercel function runtime refuses require(esm); local Node 24 allows it.
// Twice on 2026-10-15 a firebase-admin 14 bump (jwks-rsa 4 → require("jose"),
// jose 6 is ESM-only) passed every local check and took login down in
// production: first the backoffice (#439), then the SDK through a Dependabot
// security PR (#442) merged without running tests. A test can be skipped; the
// build can't. So the build loads each server package the way that runtime
// does — with --no-experimental-require-module — and stops on failure.

import { spawnSync } from "node:child_process";

const SERVER_MODULES = ["firebase-admin/app", "firebase-admin/auth", "firebase-admin/firestore", "firebase-admin/storage", "fastify"];

const failures = [];
for (const mod of SERVER_MODULES) {
  const r = spawnSync(process.execPath, ["--no-experimental-require-module", "-e", `require(${JSON.stringify(mod)})`], { encoding: "utf8" });
  if (r.status !== 0) failures.push(`${mod}: ${(r.stderr.match(/Error \[[A-Z_]+\][^\n]*/) || [r.stderr.split("\n")[0]])[0]}`);
}
if (failures.length) {
  console.error("[check-server-deps] these server packages can't load in the Vercel runtime (no require(esm)):");
  for (const f of failures) console.error("  ✗ " + f);
  console.error("[check-server-deps] Usually a major bump of firebase-admin (jwks-rsa → ESM-only jose). Pin the previous major.");
  process.exit(1);
}
console.log(`[check-server-deps] ${SERVER_MODULES.length} server packages load without require(esm) ✓`);
