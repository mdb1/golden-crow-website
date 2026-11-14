// map-in-batches.ts
//
// Run an async mapper over a list with a bounded number of items in flight,
// preserving input order in the result. Pure helper (NOT a "use server"
// module) so Server Action files can import it without exporting a sync
// function themselves.
//
// Why it exists (#484): the roster used to cap itself at 50 clients to bound
// the per-client query fan-out. Dropping the cap without a bound would fire
// ~8 × N concurrent Firestore queries from one serverless invocation; running
// the fan-out in waves keeps the socket/memory pressure flat for big rosters
// while still reading every client.

export async function mapInBatches<T, R>(
  items: readonly T[],
  batchSize: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const size = Math.max(1, Math.floor(batchSize));
  const out: R[] = [];
  for (let start = 0; start < items.length; start += size) {
    const wave = items.slice(start, start + size);
    const results = await Promise.all(
      wave.map((item, offset) => mapper(item, start + offset)),
    );
    out.push(...results);
  }
  return out;
}

/** Split a list into consecutive chunks of at most `size` items. */
export function chunkList<T>(items: readonly T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}
