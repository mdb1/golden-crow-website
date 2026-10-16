#!/usr/bin/env node
// smoke-start.mjs — runs AFTER `next build`, inside `npm run build`, so Vercel
// refuses to deploy a backoffice whose login can't load.
//
// Starts the production build with require(esm) OFF — the Vercel function
// runtime mode; local Node 24 allows it, which is how firebase-admin 14 took
// every signed-in page to 500 on 2026-10-15 with everything green locally —
// and sends the requests a browser sends when someone signs in, on BOTH
// surfaces:
//
//   Pocket Genes   /login 200 · NextAuth providers/csrf 200 · dashboard → 307
//                  /login · patient/publisher portals → 307 their own login
//   Corvo          /gc-fitness/login 200 · POST /api/gc-fitness/login with a
//                  bad token → 403 (firebase-admin loaded and rejected it) ·
//                  /gc-fitness/dashboard → 307 /gc-fitness/login
//   Open API       report upload without a token → 401
//   Server log     no ERR_REQUIRE_ESM / ERR_REQUIRE_ASYNC_MODULE
//
// Needs the same env as the app (Vercel has it at build time; locally
// .env.local). Never calls the SDK, never signs anyone in, writes nothing.
// The deploy-skew script (scripts/check-deploy-skew.sh) runs the same "new
// tabs" checks plus the old-tab comparison; this is the always-on part.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const NEXT_BIN = createRequire(import.meta.url).resolve("next/dist/bin/next");
const PORT = 33000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const READY_TIMEOUT_MS = 90_000;

let log = "";
const server = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(PORT), "-H", "127.0.0.1"], {
  cwd: ROOT,
  env: {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, "--no-experimental-require-module"]
      .filter(Boolean)
      .join(" "),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (d) => (log += d));
server.stderr.on("data", (d) => (log += d));
const stop = () => {
  if (server.exitCode === null) server.kill("SIGTERM");
};
process.on("exit", stop);

const failures = [];
const check = (label, ok, detail = "") => {
  if (ok) console.log(`[smoke-start] ✓ ${label}`);
  else {
    console.error(`[smoke-start] ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failures.push(label);
  }
};

async function request(pathname, init = {}) {
  const res = await fetch(BASE + pathname, { redirect: "manual", ...init });
  const location = (res.headers.get("location") ?? "").replace(/^https?:\/\/[^/]+/, "");
  await res.arrayBuffer();
  return { status: res.status, location };
}

async function waitForReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) return false;
    try {
      await fetch(`${BASE}/login`, { redirect: "manual" });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

try {
  const ready = await waitForReady();
  check("next start serves in the Vercel runtime mode (no require(esm))", ready, log.slice(-1500));
  if (ready) {
    const expectStatus = async (label, pathname, status, init) => {
      const r = await request(pathname, init);
      check(`${label} → ${status}`, r.status === status, `got ${r.status}${r.location ? ` → ${r.location}` : ""}`);
    };
    const expectRedirect = async (label, pathname, target) => {
      const r = await request(pathname);
      check(
        `${label} → 307 ${target}`,
        r.status === 307 && r.location.split("?")[0] === target,
        `got ${r.status} ${r.location}`,
      );
    };

    // Pocket Genes
    await expectStatus("Pocket Genes login page", "/login", 200);
    await expectStatus("NextAuth providers", "/api/auth/providers", 200);
    await expectStatus("NextAuth csrf", "/api/auth/csrf", 200);
    await expectRedirect("Pocket Genes dashboard without a session", "/", "/login");
    await expectRedirect("patient portal without a session", "/patient-portal/home", "/patient-portal/login");
    await expectRedirect("publisher portal without a session", "/publisher-portal/home", "/publisher-portal/login");

    // Corvo
    await expectStatus("Corvo login page", "/gc-fitness/login", 200);
    await expectStatus("Corvo session API with a bad token (firebase-admin loads and rejects it)", "/api/gc-fitness/login", 403, {
      method: "POST",
      headers: { Authorization: "Bearer not-a-token", "Content-Type": "application/json" },
      body: "{}",
    });
    await expectRedirect("Corvo dashboard without a session", "/gc-fitness/dashboard", "/gc-fitness/login");

    // Open API (external integrations)
    await expectStatus("Open API report upload without a token", "/open-api/reporting/reports/upload", 401, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  }
  const esm = log.match(/ERR_REQUIRE_ESM|ERR_REQUIRE_ASYNC_MODULE/g)?.length ?? 0;
  check("no ERR_REQUIRE_ESM in the server log", esm === 0, `${esm} occurrence(s)`);
} catch (err) {
  check("smoke run completed", false, String(err));
} finally {
  stop();
}

if (failures.length) {
  console.error(`[smoke-start] ${failures.length} check(s) failed — the deploy stops here. Server log tail:`);
  console.error(log.slice(-3000));
  process.exit(1);
}
console.log("[smoke-start] Pocket Genes and Corvo login paths load in the Vercel runtime mode ✓");
process.exit(0);
