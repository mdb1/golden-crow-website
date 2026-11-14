import { chunkList, mapInBatches } from "../map-in-batches";

describe("mapInBatches", () => {
  it("maps every item in order with at most `batchSize` in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapInBatches(Array.from({ length: 60 }, (_, i) => i), 25, async (n, idx) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return n * 10 + (idx === n ? 0 : 1);
    });
    expect(out).toEqual(Array.from({ length: 60 }, (_, i) => i * 10));
    expect(peak).toBe(25);
  });
  it("handles an empty list", async () => {
    expect(await mapInBatches([], 5, async (x) => x)).toEqual([]);
  });
});

describe("chunkList", () => {
  it("splits into chunks of at most size", () => {
    expect(chunkList([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkList([], 30)).toEqual([]);
  });
});
