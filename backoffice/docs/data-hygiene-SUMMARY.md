# Data Hygiene Admin

## What changed

- Added a dedicated GC Fitness admin page at `src/app/gc-fitness/admin/hygiene/page.tsx`.
- Added a paginated client feed at `src/app/gc-fitness/admin/hygiene/DataHygieneFeed.tsx` with a `Cargar más` control.
- Added a new server-action layer at `src/lib/gc-fitness/data-hygiene-actions.ts` to:
  - scan for orphaned or suspicious `users`, `chats`, `progress_photos`, `workout_templates`, `workout_assignments`, `workout_logs`, and `exercises`;
  - return a bounded page of anomaly rows with counts;
  - purge each row with an explicit destructive CTA.
- Added a navigation card on `src/app/gc-fitness/admin/page.tsx` so the new hygiene dashboard is visible from the main admin screen.

## Deletion behavior

- Users reuse the existing client/coach cascade actions when possible.
- Chats are hard-deleted recursively.
- Progress photos delete both Firestore metadata and the Storage blob when the path is present.
- Workout assignments delete related workout logs first, then the assignment doc.
- Workout logs, workout templates, and exercises are hard-deleted from Firestore.

## Scan limits

- The dashboard is intentionally conservative.
- Each collection is sampled with a bounded scan window (`SCAN_LIMIT = 120`) and the UI shows 20 rows at a time.
- Reference lookups fall back to `doc(id).get()` for the linked user/doc when the sampled window does not contain the parent, which reduces false positives.

## Follow-up ideas

- Add finer-grained filters per category if the anomaly feed gets crowded.
- Extend exercise deletion to clean up any storage assets attached to orphaned exercise docs.
- Add tests for the new server-action scan/purge behavior once the desired anomaly rules settle.
