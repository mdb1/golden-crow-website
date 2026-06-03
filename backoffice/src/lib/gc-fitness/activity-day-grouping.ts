// activity-day-grouping.ts
//
// Shared helper for the trainer activity feeds (Recent Logs + My Activity),
// both of which paginate newest-first by timestamp but group their loaded rows
// into per-day sections on the client.
//
// THE BUG THIS FIXES (260602): pagination cuts through a day. The server hands
// back a window of rows ending at an arbitrary timestamp, so the OLDEST loaded
// day is usually only partially loaded. A client/day group therefore renders
// "2 acciones", and then jumps to "4 acciones" once the next page brings in
// that day's earlier rows — the group's contents and count change after the
// user already saw them.
//
// THE INVARIANT that makes this cheap to fix: rows arrive strictly
// newest-first, so every day STRICTLY NEWER than the oldest loaded day is
// already fully loaded. Only the oldest loaded day (the pagination boundary)
// can still grow. So while more pages exist (`hasMore`), we simply don't render
// that trailing day yet — every day we DO render is guaranteed complete and
// stable. "Load more" reveals the next complete day.
//
// `sections` must be ordered newest-day-first (the order both feeds build).

export function visibleCompleteSections<T>(sections: T[], hasMore: boolean): T[] {
  if (!hasMore) return sections;
  // Drop the trailing (oldest) day — it may still grow on the next page.
  return sections.length > 0 ? sections.slice(0, -1) : sections;
}
