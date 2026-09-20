#!/usr/bin/env bash
# vercel-ignore-build.sh — Vercel's "Ignored Build Step" for golden-crow-backoffice.
#
# WHY THIS EXISTS (gc-fitness#382 / golden-crow-website#382)
#
# Next.js derives every Server Action's ID from a hash of the build. When the
# server redeploys, those IDs change, and a tab a coach left open keeps posting
# an ID that no longer exists — they get
#
#     Server Action "404583b2…" was not found on the server.
#
# under a form they had already filled in. The only escape is a hard reload,
# which throws the form away.
#
# Before this script, the project's Ignored Build Step was:
#
#     if [ "$VERCEL_ENV" == "production" ]; then exit 1; else exit 0; fi
#
# i.e. "always build production, never build previews" — so EVERY push to main
# redeployed the backoffice, including the ones that only touch the public
# marketing site. On 2026-09-14 five consecutive commits touched only
# `pocket-genes/`: five deploys, five action-ID rotations, zero changes for any
# coach. That is why this hits so often and doesn't feel like bad luck.
#
# This script keeps the preview half of that rule exactly as it was and adds the
# path filter to the production half.
#
# EXIT CODES (Vercel's, and they are the opposite of what you'd guess):
#   exit 0 → build is ABORTED (deployment CANCELED, production alias untouched)
#   exit 1 → build CONTINUES as normal
#
# Vercel runs this command from the project's Root Directory, which for this
# project is `backoffice/` — so `.` below means the backoffice subtree.
# See https://vercel.com/docs/project-configuration/project-settings#ignored-build-step

set -u

log() { echo "[ignore-build] $*"; }

# ── 1. Previews: unchanged from the previous setting — never build ───────────
if [ "${VERCEL_ENV:-}" != "production" ]; then
  log "VERCEL_ENV=${VERCEL_ENV:-unset} is not production — skipping build (unchanged behavior)."
  exit 0
fi

# ── 2. Refuse to guess about the working directory ───────────────────────────
# If this ever runs somewhere other than `backoffice/`, `git diff -- .` would
# compare the WRONG subtree. The dangerous direction is a false "nothing
# changed", which would silently stop shipping the backoffice forever while
# every deploy looked fine. So assert where we are, and on any doubt BUILD.
if ! grep -q '"name": *"backoffice"' package.json 2>/dev/null; then
  log "not in the backoffice root (cwd=$(pwd)) — building to be safe."
  exit 1
fi

# ── 3. Did this commit touch the backoffice? ─────────────────────────────────
# `.githooks/pre-commit` bumps `src/lib/app-version.ts` on every pushed commit.
# That visible version is the operator's proof of the running release, so it
# must count as a backoffice change and trigger a production deployment.
#
# `git diff --quiet` exits 0 when there is NO diff, 1 when there is one, and
# 128 when git itself fails (a shallow clone with no HEAD^, say). Only the
# explicit "no diff" answer is allowed to skip; everything else builds.
if git diff --quiet "HEAD^" "HEAD" -- . 2>/dev/null; then
  log "no changes under backoffice/ in $(git rev-parse --short HEAD) — skipping build."
  log "Server Action IDs keep pointing at the deployment coaches already have open."
  exit 0
fi

log "backoffice changed (or the diff could not be computed) — building."
exit 1
