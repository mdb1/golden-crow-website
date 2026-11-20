// #503 — cursor paging of the admin activity feed: the boundary rules.
import {
  cutFeedPage,
  decodeFeedCursor,
  encodeFeedCursor,
  newWindowHorizon,
  noteWindow,
} from "../activity-feed-paging";

const T = (min: number) => new Date(Date.UTC(2026, 10, 14, 12, min)).toISOString();
const ms = (min: number) => Date.UTC(2026, 10, 14, 12, min);
const ev = (id: string, min: number) => ({ id, occurredAtISO: T(min) });
const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id);

describe("noteWindow", () => {
  it("only a FULL window limits the horizon, and the newest oldest-row wins", () => {
    const h = newWindowHorizon();
    noteWindow(h, 10, 400, ms(1)); // short: complete
    expect(h.oldestFullMs).toBeNull();
    noteWindow(h, 400, 400, ms(5));
    noteWindow(h, 120, 120, ms(20));
    noteWindow(h, 400, 400, ms(10));
    expect(h.oldestFullMs).toBe(ms(20));
  });
});

describe("cursor encoding", () => {
  it("round-trips and rejects garbage", () => {
    const c = { beforeMs: ms(3), seenIds: ["a", "b"] };
    expect(decodeFeedCursor(encodeFeedCursor(c))).toEqual(c);
    expect(decodeFeedCursor("not-a-cursor")).toBeNull();
    expect(decodeFeedCursor("")).toBeNull();
    expect(decodeFeedCursor(Buffer.from('{"x":1}').toString("base64url"))).toBeNull();
  });
});

describe("cutFeedPage", () => {
  const events = [ev("e9", 9), ev("e8", 8), ev("e7", 7), ev("e6", 6), ev("e5", 5)];

  it("everything complete and under the limit → no next page", () => {
    const r = cutFeedPage(events, { limit: 10, horizon: newWindowHorizon(), cursor: null });
    expect(ids(r.page)).toEqual(["e9", "e8", "e7", "e6", "e5"]);
    expect(r.nextCursor).toBeNull();
  });

  it("over the limit → resumes at the last row's instant, remembering it", () => {
    const r = cutFeedPage(events, { limit: 2, horizon: newWindowHorizon(), cursor: null });
    expect(ids(r.page)).toEqual(["e9", "e8"]);
    expect(r.nextCursor).toEqual({ beforeMs: ms(8), seenIds: ["e8"] });
    const r2 = cutFeedPage(events, { limit: 2, horizon: newWindowHorizon(), cursor: r.nextCursor });
    expect(ids(r2.page)).toEqual(["e7", "e6"]);
  });

  it("rows sharing the cut's millisecond are neither lost nor repeated", () => {
    const tie = [ev("a", 9), ev("b", 8), ev("c", 8), ev("d", 7)];
    const r = cutFeedPage(tie, { limit: 2, horizon: newWindowHorizon(), cursor: null });
    expect(ids(r.page)).toEqual(["a", "b"]);
    const r2 = cutFeedPage(tie, { limit: 2, horizon: newWindowHorizon(), cursor: r.nextCursor });
    expect(ids(r2.page)).toEqual(["c", "d"]);
  });

  it("stops at the safe horizon of a full window and resumes from it", () => {
    const h = newWindowHorizon();
    noteWindow(h, 400, 400, ms(7)); // a busy source only reached back to :07
    const r = cutFeedPage(events, { limit: 10, horizon: h, cursor: null });
    // e6/e5 come from a quieter source; showing them would let the cursor skip
    // the busy source's rows between :06 and :07 that were never read.
    expect(ids(r.page)).toEqual(["e9", "e8", "e7"]);
    expect(r.nextCursor).toEqual({ beforeMs: ms(7), seenIds: ["e7"] });
  });

  it("a full window offers a next page even when nothing older passed the filters", () => {
    const h = newWindowHorizon();
    noteWindow(h, 400, 400, ms(2));
    const r = cutFeedPage([ev("e9", 9)], { limit: 10, horizon: h, cursor: null });
    expect(r.nextCursor?.beforeMs).toBe(ms(2));
  });

  it("does not loop when a page starts at the horizon and finds nothing new", () => {
    const h = newWindowHorizon();
    noteWindow(h, 400, 400, ms(5));
    const r = cutFeedPage([ev("x", 5)], {
      limit: 10,
      horizon: h,
      cursor: { beforeMs: ms(5), seenIds: ["x"] },
    });
    expect(r.page).toEqual([]);
    expect(r.nextCursor).toBeNull();
  });

  it("drops rows newer than the cursor (the reader re-reads to the end of its ms)", () => {
    const r = cutFeedPage(events, {
      limit: 10,
      horizon: newWindowHorizon(),
      cursor: { beforeMs: ms(7), seenIds: ["e7"] },
    });
    expect(ids(r.page)).toEqual(["e6", "e5"]);
  });
});
