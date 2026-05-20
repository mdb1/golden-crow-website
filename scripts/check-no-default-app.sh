#!/usr/bin/env bash
# check-no-default-app.sh — Pitfall 16 PR-check (Phase 11 BO-02).
#
# Forbids any call to `initializeApp()` from `firebase-admin/app` that
# does NOT pass an explicit project-key name argument.
#
# The named-app registry in `goldencrow-sdk/src/config/firebase.ts` is
# the SOLE legitimate site that calls `initializeApp(config, projectKey)`.
# Any other call site (a future engineer adding a "quick" admin handle)
# would collide with the default-app slot and cause cross-project state
# bleed — see PATTERNS.md Pattern A + the Pitfall 16 register entry.
#
# Allowlisted second-arg tokens (the call site is OK):
#   - "mydnamap" | "pocket-gyms" | "gc-fitness"     literal project keys
#   - project                                       explicit name variable
#   - APP_NAME | GC_FITNESS_APP_NAME                 named-constant patterns
#
# Multi-line tolerant: a call that spans several lines is OK if any line
# inside the matched-bracket span contains one of the allowlisted tokens.
#
# Scope: ONLY firebase-admin call sites (files that import from
# `firebase-admin/...`). The browser-side `firebase` SDK in
# `backoffice/src/lib/firebase.ts` is a different module — its
# `initializeApp` takes a single config arg by design and is exempt.
#
# Usage:  bash scripts/check-no-default-app.sh
# Exit 0 = no violations. Exit 1 = violations printed to stdout.
#
# V2 carry-forward: convert to an ESLint custom rule when the lint
# config consolidation phase ships.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

SCAN_DIRS=(
  "goldencrow-sdk/src"
  "goldencrow-sdk/scripts"
  "goldencrow-sdk/api"
  "backoffice/src"
)

FILES=()
for DIR in "${SCAN_DIRS[@]}"; do
  if [[ ! -d "$DIR" ]]; then continue; fi
  while IFS= read -r -d '' f; do
    FILES+=("$f")
  done < <(find "$DIR" \
              -type d \( -name node_modules -o -name dist -o -name .next -o -name __tests__ \) -prune \
              -o -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' \) -print0)
done

# Multi-line aware scan via perl. The script is read from a heredoc with
# the delimiter QUOTED (`'PERL_END'`) so `$`-sigils inside the perl
# program are NOT expanded by bash.
read -r -d '' PERL_SCRIPT <<'PERL_END' || true
use strict;
use warnings;

my $path = $ARGV[0];

open(my $fh, "<", $path) or die "cannot open $path: $!";
my @lines = <$fh>;
close($fh);
my $src = join("", @lines);

# Skip files that do not import from firebase-admin at all — only those
# files can use the admin-SDK initializeApp().
my $is_admin_file = ($src =~ m{from\s+["']firebase-admin});
exit 0 unless $is_admin_file;

my $i = 0;
my $len = length($src);
my $violations = 0;

while ($i < $len) {
    my $idx = index($src, "initializeApp(", $i);
    last if $idx < 0;
    $i = $idx + length("initializeApp(");

    # Compute (1-indexed) line number of the token.
    my $prefix = substr($src, 0, $idx);
    my $line_num = 1 + ($prefix =~ tr/\n/\n/);
    my $line_start = rindex($prefix, "\n") + 1;
    my $line_prefix = substr($src, $line_start, $idx - $line_start);

    # Skip pure-comment / import contexts.
    if ($line_prefix =~ m{^\s*//})    { next; }
    if ($line_prefix =~ m{^\s*\*})    { next; }
    if ($line_prefix =~ m{//[^"']*$}) { next; }
    if ($line_prefix =~ m{\bimport\b}) { next; }

    # Char-walk to find the matching `)`, respecting strings + comments.
    my $depth = 1;
    my $j = $i;
    my $in_str = "";
    while ($j < $len && $depth > 0) {
        my $c = substr($src, $j, 1);
        if ($in_str ne "") {
            if ($c eq "\\") { $j += 2; next; }
            if ($c eq $in_str) { $in_str = ""; }
            $j++;
            next;
        }
        if ($c eq '"' || $c eq "'" || $c eq '`') {
            $in_str = $c;
            $j++;
            next;
        }
        if (substr($src, $j, 2) eq "//") {
            my $nl = index($src, "\n", $j);
            $j = ($nl < 0) ? $len : $nl;
            next;
        }
        if (substr($src, $j, 2) eq "/*") {
            my $end = index($src, "*/", $j);
            $j = ($end < 0) ? $len : $end + 2;
            next;
        }
        if    ($c eq "(") { $depth++; }
        elsif ($c eq ")") { $depth--; }
        $j++;
    }
    my $body = substr($src, $i, $j - $i - 1);

    # Body must contain an allowlisted second-arg token.
    my $ok = 0;
    $ok = 1 if $body =~ m{,\s*"mydnamap"};
    $ok = 1 if $body =~ m{,\s*"pocket-gyms"};
    $ok = 1 if $body =~ m{,\s*"gc-fitness"};
    $ok = 1 if $body =~ m{,\s*project\b};
    $ok = 1 if $body =~ m{,\s*APP_NAME\b};
    $ok = 1 if $body =~ m{,\s*GC_FITNESS_APP_NAME\b};

    unless ($ok) {
        my $snippet = $lines[$line_num - 1] // "";
        $snippet =~ s/^\s+//;
        chomp $snippet;
        if (length($snippet) > 140) { $snippet = substr($snippet, 0, 137) . "..."; }
        print "$path:$line_num: $snippet\n";
        $violations++;
    }
    $i = $j;
}

exit($violations > 0 ? 1 : 0);
PERL_END

VIOLATIONS_FILE=$(mktemp)
trap 'rm -f "$VIOLATIONS_FILE"' EXIT

for f in "${FILES[@]}"; do
  perl -e "$PERL_SCRIPT" -- "$f" >> "$VIOLATIONS_FILE" 2>&1 || true
done

if [[ -s "$VIOLATIONS_FILE" ]]; then
  COUNT=$(wc -l < "$VIOLATIONS_FILE" | tr -d '[:space:]')
  echo "Pitfall 16 violation — initializeApp() without explicit project name:"
  echo ""
  cat "$VIOLATIONS_FILE"
  echo ""
  echo "Found $COUNT suspect line(s). Use adminAppFor(projectKey) from"
  echo "goldencrow-sdk/src/config/firebase.ts (or initializeApp(cfg, '<key>')"
  echo "inside that registry's single call site)."
  exit 1
fi

echo "check-no-default-app: OK — no default-app firebase-admin initializeApp() calls in scanned dirs."
exit 0
