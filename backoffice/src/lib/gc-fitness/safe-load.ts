// safe-load.ts
//
// Section-level resilience for GC Fitness pages.
//
// WHY THIS EXISTS (260529 dashboard + recent-logs outage):
// A Server Component page that `await`s a data loader directly will 500 the
// ENTIRE page if that one loader throws. The 260529 outage was exactly this:
// `listRecentLogsForTrainer()` threw FAILED_PRECONDITION (a new civilDate-
// windowed query whose composite index was still BUILDING), and because the
// dashboard awaited it unguarded, the whole dashboard fell into its error
// boundary — even though counts / roster / pulse were fine.
//
// `safe()` isolates each section: wrap every independent loader so a single
// failure degrades THAT section (renders an empty/zero state) instead of
// taking down the page. `recent-logs/page.tsx` already did this inline with a
// try/catch + recovery card; this centralizes the pattern so every page can
// apply it uniformly and so it is unit-testable.
//
// Contract: returns the loader's value on success, or `null` on any throw
// (logged via console.error so failures stay visible in Vercel logs). The
// caller supplies the fallback at the call site, e.g.:
//   const roster = (await safe("roster", listClientsForRoster)) ?? [];

export async function safe<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[gc-fitness] section "${label}" failed — degrading`, err);
    return null;
  }
}
