#!/usr/bin/env bash
# verify-action-ids.sh — proves NEXT_SERVER_ACTIONS_ENCRYPTION_KEY pins the
# Server Action IDs (#382).
#
# Three clean production builds of this package:
#   A  key K1
#   B  key K1   → must produce EXACTLY the same action IDs as A
#   C  key K2   → must produce DIFFERENT IDs (proves the key is what's used;
#                 without this, A == B could just mean the IDs ignore the key)
#
# IDs are the keys of .next/server/server-reference-manifest.json (node + edge).
# Each build wipes .next entirely — including .next/cache, where Next keeps the
# random key it invents when the variable is unset — so nothing leaks between
# runs. The keys used here are throwaway test keys, never the production one.
#
# Usage (from backoffice/):   bash scripts/verify-action-ids.sh
# Takes three full builds. Exit 0 = both checks hold.

set -euo pipefail

cd "$(dirname "$0")/.."

if ! grep -q '"name": *"backoffice"' package.json 2>/dev/null; then
  echo "run me from the backoffice package" >&2
  exit 2
fi

OUT="$(mktemp -d "${TMPDIR:-/tmp}/verify-action-ids.XXXXXX")"
KEY_1="$(openssl rand -base64 32)"
KEY_2="$(openssl rand -base64 32)"
MANIFEST=".next/server/server-reference-manifest.json"

build_and_extract() {
  local label="$1" key="$2"
  echo "[verify-action-ids] build $label …"
  rm -rf .next
  # VERCEL_ENV is cleared so the production-key guard in next.config.ts never
  # mixes into this experiment.
  if ! env -u VERCEL_ENV NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$key" \
      npx next build >"$OUT/build-$label.log" 2>&1; then
    echo "[verify-action-ids] build $label FAILED — see $OUT/build-$label.log" >&2
    tail -20 "$OUT/build-$label.log" >&2
    exit 2
  fi
  if [ ! -f "$MANIFEST" ]; then
    echo "[verify-action-ids] $MANIFEST not found after build $label" >&2
    exit 2
  fi
  node -e '
    const m = require(require("path").resolve(process.argv[1]));
    const ids = [...Object.keys(m.node || {}), ...Object.keys(m.edge || {})];
    process.stdout.write([...new Set(ids)].sort().join("\n") + "\n");
  ' "$MANIFEST" >"$OUT/ids-$label.txt"
  echo "[verify-action-ids]   $(wc -l <"$OUT/ids-$label.txt" | tr -d ' ') action IDs"
}

build_and_extract A "$KEY_1"
build_and_extract B "$KEY_1"
build_and_extract C "$KEY_2"

status=0

if [ ! -s "$OUT/ids-A.txt" ]; then
  echo "[verify-action-ids] FAIL: build A has no action IDs — nothing was compared." >&2
  exit 1
fi

if diff -q "$OUT/ids-A.txt" "$OUT/ids-B.txt" >/dev/null; then
  echo "[verify-action-ids] PASS: same key → identical IDs (A == B)."
else
  echo "[verify-action-ids] FAIL: same key, different IDs:" >&2
  diff "$OUT/ids-A.txt" "$OUT/ids-B.txt" | head -20 >&2
  status=1
fi

shared="$(comm -12 "$OUT/ids-A.txt" "$OUT/ids-C.txt" | wc -l | tr -d ' ')"
if [ "$shared" = "0" ]; then
  echo "[verify-action-ids] PASS: different key → every ID changed (A ∩ C = 0)."
else
  echo "[verify-action-ids] FAIL: $shared IDs survived a key change — the key is not what salts them." >&2
  status=1
fi

echo "[verify-action-ids] logs and ID lists: $OUT"
exit "$status"
