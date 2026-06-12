# 260612 Bulk Habit Assign Dialog Wide Layout + Recurrence

## Scope

Adjusted the GC Fitness bulk habit assignment modal in the backoffice so it
fits more information on screen and surfaces the recurrence selector more
prominently.

## Implemented

- Expanded the dialog width from the narrow default to a wide layout that uses
  most of the viewport on desktop.
- Reworked the body into a two-column responsive grid:
  - left column: habit template picker + recurrence selector
  - right column: client checklist + start date
- Kept the recurrence editor seeded from the picked template, so trainers can
  still override one-time / daily / weekly / monthly before assigning.
- Kept the client list scrollable while making the overall modal visually wider
  and easier to scan.

## Verification

- `npx tsc --noEmit` passed in `golden-crow-website/backoffice`.
- `git diff --check` passed in `golden-crow-website`.

