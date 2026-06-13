# Legacy Exercise Retirement

**Status:** active (code-side hiding shipped 2026-06-12 — "legacy exercise retirement")
**Single source of truth:** [`src/lib/gc-fitness/exercise-visibility.ts`](../src/lib/gc-fitness/exercise-visibility.ts) (`isPickableExercise`)

## What this is

The shared `exercises` Firestore collection accumulated three generations of
catalog seeds (wger, free-exercise-db, alias dedupe docs) plus a NEW curated
"standard library". Coaches were seeing 400+ legacy duplicates in every
exercise-choice surface. This change hides the legacy catalog from the choice
surfaces **without deleting any data**, so the new standard library and
coach-authored exercises are the only pickable options, while every historical
routine that references a legacy id keeps resolving.

## Classification rule

An exercise is **pickable** if and only if:

1. it is NOT soft-deleted (`deleted !== true`), AND
2. its `tags` contains `"standard-library"` (the new curated library), **OR**
   its `source === "trainer"` AND `ownerId != null` (a genuine coach-authored
   exercise).

Everything else is **hidden** from the choice surfaces.

> ⚠️ **The `ownerId != null` guard is load-bearing.** `snapToRow`
> (`exercises-listener.ts`) coerces ANY unknown wire `source` — including the 24
> `"standard_alias"` docs — to `"trainer"`. A bare `source === "trainer"` check
> would therefore wrongly keep alias docs pickable. All 24 alias docs have
> `ownerId: null`; all 38 genuine trainer docs have `ownerId` set, so the guard
> is what separates them after snapToRow normalization.

The predicate is wired into the three choice surfaces via `.filter(isPickableExercise)`:

- `src/components/gc-fitness/exercise-picker-popover.tsx` — `visible` + `liveCount` memos
- `src/components/gc-fitness/exercise-multi-add-dialog.tsx` — `exercises` memo
- `src/app/gc-fitness/exercises/client.tsx` — `rows` memo

The library page "Standard" / "Custom" source filter keeps working unchanged —
with legacy hidden, "Standard" now means the new curated library and "Custom"
means trainer-authored.

## Audited prod counts (2026-06-12, project `gcfitness-3476b`)

| Bucket | Count | Disposition |
|--------|-------|-------------|
| **Total docs** | **871** | — |
| New standard library (`tags: ["standard-library"]`; 257 numeric-ID + 15 `std-*`) | 272 | **Pickable** |
| Trainer-authored (live, `source: "trainer"`, `ownerId` set) | 38 | **Pickable** |
| Legacy free-exercise-db (`fexd-*`, `source: "free-exercise-db"`, no tag) | 237 | Hidden code-side |
| Legacy wger (`wger-*`, live, `source: "wger"`, no tag) | 139 | Hidden code-side |
| Legacy alias (`alias-*`, `source: "standard_alias"` → coerced to `"trainer"`, `ownerId: null`) | 24 | Hidden code-side |
| wger docs already `deletedAt`-filtered server-side | 161 | Already filtered |

Pickable = 272 + 38 = **310**. Hidden live legacy = 237 + 139 + 24 = **400**.
(310 + 400 + 161 ≈ 871; small rounding from concurrent edits during the audit.)

## Why hiding is CODE-SIDE only (never `deleted:true` / `mergedInto`)

We deliberately do NOT mutate Firestore to hide legacy docs.

- Setting `deleted: true` breaks the **iOS exercise-detail screen**, which
  filters on `deleted` to decide whether an exercise `isLive` — a referenced-but-
  deleted exercise would vanish from a client's existing routine detail.
- Writing `mergedInto` to redirect a legacy id caused the **2026-06-12 dangling-
  mergedInto incident**: a `mergedInto` pointing at a non-existent canonical id
  broke detail screens in prod. See
  `.planning/quick/260612-urgent-dangling-mergedinto/INCIDENT.md`.

Code-side hiding keeps every legacy doc alive and resolvable while removing it
from the curated picker. No wire payload changes; no security-rule changes.

## What still references legacy ids (must keep resolving)

Legacy exercise ids remain referenced by historical data. These must keep
resolving names + thumbnails — which is why the picker's `selected` memo
resolves over the FULL unfiltered query, NOT the filtered list:

- `workout_templates` — `exercises[].exerciseId`
- `workout_assignments` — per-assignment exercise snapshots
- `workout_logs` / set logs — logged exercise ids
- progress charts — per-exercise volume/PR series keyed by exercise id

## DELIBERATE mobile gap (cross-platform parity)

This filter ships **backoffice-only**. The iOS and Android Library tabs still
browse the full legacy catalog (browse-only) until a twin `isPickableExercise`
filter ships on each native surface. This is acceptable for now because coaches
author/pick exercises in the backoffice, not on mobile.

> **TODO (parity):** port `isPickableExercise` to the iOS `GCFitnessCore`
> exercise list and the Android `core` exercise list so the mobile Library tabs
> hide legacy exercises identically. Track per the cross-platform parity rule in
> `gc-fitness/CLAUDE.md`. Strings: none added here (no user-facing copy change).

## Safe hard-removal checklist (FUTURE — not done here)

When we decide to physically delete legacy docs from Firestore:

1. **Per-id reference audit.** For EACH legacy id, scan every referencing
   collection — `workout_templates.exercises[].exerciseId`,
   `workout_assignments` snapshots, `workout_logs` / set logs, and progress
   chart series — and either migrate the reference to a canonical
   standard-library id or accept the data loss.
2. **Beta-only safety.** All current users are beta testers, so accepting loss
   for orphaned references is tolerable — but confirm the count first.
3. **Delete Storage media too.** Remove the exercise's Firebase Storage assets
   (`gifUrl` / `imageUrl` / `endImageUrl` / `thumbnailURL`) so the bucket
   doesn't keep dangling media.
4. **Remove `alias-*` docs LAST.** Alias docs may back-reference canonical ids;
   deleting them before the docs they point at can strand resolution paths.
5. **Mobile twins first.** Ship the iOS/Android `isPickableExercise` filter
   before hard-removal so the mobile Library tabs don't 404 on freshly-deleted
   ids.
