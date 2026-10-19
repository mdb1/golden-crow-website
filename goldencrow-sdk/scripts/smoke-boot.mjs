#!/usr/bin/env node
// smoke-boot.mjs — runs AFTER `tsc`, inside `npm run build`, so Vercel refuses
// to deploy an SDK that can't serve a login.
//
// check-server-deps.mjs loads a fixed list of packages; this boots the REAL
// compiled app (dist/server.js) the way the Vercel function runtime does —
// without require(esm) — and sends it the requests the backoffice sends on
// login. It needs no credentials: a bad token is rejected before any Firebase
// call that would need them, and the anonymous checks stop at the auth hook.
//
//   POST /auth/login (bad token)          → 401, never 500
//   GET  /auth/context (no session)       → 401
//   every non-public route (no session)   → 401   (the global auth hook is on)
//   GET  /health                          → 200 or 503 (503 = no credentials here)
//
// 2026-10-15: a Dependabot bump made every /auth/login answer 500 for 2.5 h
// while all the SDK's tests were green (#442 → #450). That is what this stops.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Re-run in a child with require(esm) OFF, like the Vercel runtime. Our own
// flag is what tells the child it's the child.
if (!process.env.SMOKE_BOOT_CHILD) {
  const r = spawnSync(
    process.execPath,
    ["--no-experimental-require-module", fileURLToPath(import.meta.url)],
    {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, SMOKE_BOOT_CHILD: "1" },
    },
  );
  process.exit(r.status ?? 1);
}

// Routes the global hook lets through on purpose. A new public route must be
// added here AND to the public-path matcher in src/server.ts — on purpose,
// twice.
const PUBLIC = new Set([
  "GET /health",
  "POST /auth/login",
  "POST /auth/logout",
  "POST /auth/email-signup",
  "POST /auth/email-signup/eligibility",
  "POST /client-bookings",
  "POST /discover/publisher-favicon",
  "POST /discover/publisher-requests",
  "POST /service-transactions/:transactionId/notify-owner",
  "POST /service-transactions/notify-requester",
  "POST /service-transactions/notify-provider",
]);
const isPublic = (method, url) =>
  PUBLIC.has(`${method} ${url}`) || url.startsWith("/internal/openapi/");

const failures = [];
const check = (label, ok, detail = "") => {
  if (ok) console.log(`[smoke-boot] ✓ ${label}`);
  else {
    console.error(`[smoke-boot] ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failures.push(label);
  }
};

let app;
const routes = [];
try {
  const { buildServer } = await import(path.join(ROOT, "dist", "server.js"));
  app = await buildServer({
    logger: false,
    onRoute: (r) => {
      for (const m of [r.method].flat()) {
        if (m !== "HEAD" && m !== "OPTIONS") routes.push({ method: m, url: r.url });
      }
    },
  });
  await app.ready();
  check(`app boots without require(esm) (${routes.length} routes)`, routes.length > 0);
} catch (err) {
  console.error(err);
  check("app boots without require(esm)", false, err?.code ?? String(err));
  process.exit(1);
}

const login = await app.inject({
  method: "POST",
  url: "/auth/login",
  payload: { idToken: "not-a-token" },
});
check("POST /auth/login with a bad token → 401", login.statusCode === 401, `got ${login.statusCode} ${login.body.slice(0, 200)}`);

const ctx = await app.inject({ method: "GET", url: "/auth/context" });
check("GET /auth/context without a session → 401", ctx.statusCode === 401, `got ${ctx.statusCode}`);

const health = await app.inject({ method: "GET", url: "/health" });
check("GET /health answers (200/503)", [200, 503].includes(health.statusCode), `got ${health.statusCode}`);

// Every protected route must stop at the auth hook. Path params get a dummy
// value; the hook runs before validation, so the body doesn't matter.
const open = [];
for (const { method, url } of routes) {
  if (isPublic(method, url)) continue;
  const concrete = url.replace(/:[^/]+/g, "smoke").replace(/\*$/, "smoke");
  const res = await app.inject({ method, url: concrete });
  if (res.statusCode !== 401) open.push(`${method} ${url} → ${res.statusCode}`);
}
check(
  `all ${routes.filter((r) => !isPublic(r.method, r.url)).length} protected routes reject an anonymous request with 401`,
  open.length === 0,
  open.slice(0, 20).join("; "),
);

await app.close();
if (failures.length) {
  console.error(`[smoke-boot] ${failures.length} check(s) failed — the deploy stops here.`);
  process.exit(1);
}
console.log("[smoke-boot] the SDK boots and serves login in the Vercel runtime mode ✓");
