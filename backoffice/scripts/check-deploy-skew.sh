#!/usr/bin/env bash
# check-deploy-skew.sh — will this version break the tabs coaches have open?
#
# #382. Builds the BASE version (default: origin/main, i.e. what is deployed)
# and the CURRENT working tree with the SAME Server Actions key — exactly what
# production does, since NEXT_SERVER_ACTIONS_ENCRYPTION_KEY is fixed — and
# checks both kinds of tabs:
#
#   PRE-OPENED TABS (rendered by BASE, posting to the NEW server):
#     every action ID the base build registered must still exist in the new
#     build AND belong to the SAME file#export.
#       • missing          → that tab's next save fails ("not found")
#       • different export → that tab's next save runs ANOTHER action (the
#                            inline-closure trap #438 removed)
#     A missing ID is only allowed if its action is listed under "retired" in
#     server-actions.contract.json (removed on purpose, a deploy after its
#     replacement shipped).
#
#   NEW TABS (the new build on its own), against `next start` run with
#   `--no-experimental-require-module` — the Vercel function runtime refuses
#   require(esm), and a dependency relying on it took every signed-in page to
#   500 on 2026-10-15 while everything was green locally:
#     the login page renders (200), a protected page redirects to login (307,
#     not a 500), the session API loads firebase-admin/auth and rejects a bad
#     token (403, not 500), every JS/CSS asset the login page references is
#     served, an action ID from the BASE build is still routed by the new
#     server (no `x-nextjs-action-not-found`), and the server log has no
#     ERR_REQUIRE_ESM.
#
# What it can NOT check: the previous build's JS chunks. Without Vercel Skew
# Protection they are gone after a deploy; an old tab that lazily loads one
# gets ChunkLoadError → the stale-deployment banner + draft restore handle it.
#
# Usage (from backoffice/):  bash scripts/check-deploy-skew.sh [base-ref]
# Takes two production builds (~2–4 min). Exit 0 = safe for both kinds of tabs.
# Run it before merging any PR that touches a "use server" file.

set -uo pipefail
cd "$(dirname "$0")/.."
BACKOFFICE="$(pwd)"
REPO="$(git rev-parse --show-toplevel)"
BASE_REF="${1:-origin/main}"

log() { echo "[deploy-skew] $*"; }
fail=0

git -C "$REPO" fetch -q origin 2>/dev/null || true
BASE_SHA="$(git -C "$REPO" rev-parse --verify "$BASE_REF^{commit}")" || { log "unknown ref $BASE_REF"; exit 2; }
WORK="$(mktemp -d "${TMPDIR:-/tmp}/deploy-skew.XXXXXX")"
BASE_TREE="$WORK/base"
SERVER_PID=""

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  git -C "$REPO" worktree remove --force "$BASE_TREE" >/dev/null 2>&1
  rm -rf "$WORK"
}
trap cleanup EXIT

export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(openssl rand -base64 32)"
unset VERCEL_ENV # never trips the production-key guard; the key above is a throwaway

log "base = $BASE_REF ($(git -C "$REPO" rev-parse --short "$BASE_SHA")), head = working tree"
git -C "$REPO" worktree add -q --detach "$BASE_TREE" "$BASE_SHA" || exit 2
BASE_BO="$BASE_TREE/backoffice"
[ -e "$BACKOFFICE/.env.local" ] && ln -s "$BACKOFFICE/.env.local" "$BASE_BO/.env.local"

# The base gets its own install: Turbopack refuses a node_modules symlinked
# from outside its root, and the base may pin different versions anyway.
log "installing base dependencies…"
(cd "$BASE_BO" && npm ci --prefer-offline --no-audit --no-fund >"$WORK/base-npm.log" 2>&1) \
  || { log "npm ci failed for base:"; tail -20 "$WORK/base-npm.log"; exit 2; }

build() { # dir label
  log "building $2…"
  (cd "$1" && rm -rf .next && npx next build >"$WORK/build-$2.log" 2>&1) \
    || { log "$2 build FAILED:"; tail -30 "$WORK/build-$2.log"; exit 2; }
  node -e '
    const m = require(process.argv[1] + "/.next/server/server-reference-manifest.json");
    const out = {};
    for (const [id, v] of Object.entries({ ...m.node, ...m.edge })) out[id] = `${v.filename}#${v.exportedName}`;
    process.stdout.write(JSON.stringify(out));
  ' "$1" >"$WORK/ids-$2.json"
}
build "$BASE_BO" base
build "$BACKOFFICE" head

# ── pre-opened tabs ──────────────────────────────────────────────────────────
node -e '
  const [base, head, contract] = process.argv.slice(1).map((p) => require(p));
  const retired = new Set((contract.retired || []).map((r) => `backoffice/${r.file}#${r.export}`));
  let broken = 0, rerouted = 0, retiredOk = 0;
  for (const [id, target] of Object.entries(base)) {
    const now = head[id];
    if (now === undefined) {
      if (retired.has(target)) { retiredOk++; continue; }
      broken++;
      console.log(`  ✗ NOT FOUND for old tabs: ${target}  (${id})`);
    } else if (now !== target) {
      rerouted++;
      console.log(`  ✗ WRONG ACTION for old tabs: ${id} was ${target}, now runs ${now}`);
    }
  }
  const total = Object.keys(base).length;
  console.log(`[deploy-skew] pre-opened tabs: ${total - broken - rerouted - retiredOk}/${total} action IDs still route to the same action` +
    (retiredOk ? `, ${retiredOk} retired on purpose` : ""));
  process.exit(broken + rerouted > 0 ? 1 : 0);
' "$WORK/ids-base.json" "$WORK/ids-head.json" "$BACKOFFICE/server-actions.contract.json" || fail=1

# ── new tabs ─────────────────────────────────────────────────────────────────
PORT=$((32000 + RANDOM % 1000))
(cd "$BACKOFFICE" && NODE_OPTIONS="--no-experimental-require-module" npx next start -p "$PORT" >"$WORK/start.log" 2>&1) &
SERVER_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$PORT/gc-fitness/login" && break; sleep 1; done

check() { # description expected actual
  if [ "$2" = "$3" ]; then log "new tabs: $1 ✓"; else log "new tabs: $1 ✗ (expected $2, got $3)"; fail=1; fi
}
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }

check "login renders" 200 "$(code "http://localhost:$PORT/gc-fitness/login")"
check "protected page redirects to login" "307 /gc-fitness/login" \
  "$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" "http://localhost:$PORT/gc-fitness/dashboard" | sed -E 's#https?://[^/]+##')"

check "session API loads firebase-admin and rejects a bad token" 403 \
  "$(code -X POST "http://localhost:$PORT/api/gc-fitness/login" -H "Authorization: Bearer not-a-token" -H "Content-Type: application/json" --data '{}')"

assets=$(curl -s "http://localhost:$PORT/gc-fitness/login" | grep -oE '/_next/static/[^"'"'"' )\\]+' | sort -u)
missing=0
for a in $assets; do [ "$(code "http://localhost:$PORT$a")" = 200 ] || { missing=$((missing + 1)); log "  missing asset $a"; }; done
check "all $(echo "$assets" | wc -l | tr -d ' ') login assets served" 0 "$missing"

# One base action ID, posted to the NEW server the way an old tab would. Uses a
# read that requires a session, so it stops at "Forbidden" and touches nothing.
CANARY=$(node -e '
  const ids = require(process.argv[1]);
  const hit = Object.entries(ids).find(([, t]) => t.endsWith("#getCurrentTrainerProfile"));
  process.stdout.write(hit ? hit[0] : "");
' "$WORK/ids-base.json")
if [ -n "$CANARY" ]; then
  nf=$(curl -s -o /dev/null -D - -X POST "http://localhost:$PORT/gc-fitness/login" \
    -H "Next-Action: $CANARY" -H "Content-Type: text/plain;charset=UTF-8" --data '[]' \
    | tr -d '\r' | grep -i '^x-nextjs-action-not-found' || true)
  check "an old tab's action ID is routed by the new server" "" "$nf"
fi

check "no ERR_REQUIRE_ESM in the server log" 0 "$(grep -c 'ERR_REQUIRE_ESM\|ERR_REQUIRE_ASYNC_MODULE' "$WORK/start.log")"

if [ "$fail" = 0 ]; then
  log "SAFE: pre-opened and new tabs both keep working."
else
  log "NOT SAFE — see above. Build logs: $WORK (deleted on exit; re-run to inspect)."
fi
exit "$fail"
