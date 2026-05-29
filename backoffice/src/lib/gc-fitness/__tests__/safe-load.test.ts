// __tests__/safe-load.test.ts
//
// Unit + "smoke" coverage for the section-level resilience wrapper that the
// dashboard uses so a single failing loader degrades ONE section instead of
// 500ing the whole page (260529 outage regression guard).
//
// This is the cheapest, least-brittle guard for the class of bug we hit: it
// proves the protection MECHANISM (safe) and the composed contract the
// dashboard relies on (every loader behind safe → page always has render-able
// data even if every query throws). The action-specific FAILED_PRECONDITION
// fallback is covered separately in recent-logs-actions.resilience.test.ts.

import { safe } from "../safe-load";

describe("safe()", () => {
  let errSpy: jest.SpyInstance;

  beforeEach(() => {
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  it("returns the loader value on success", async () => {
    await expect(safe("ok", async () => 42)).resolves.toBe(42);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("returns null and logs (does NOT throw) when the loader rejects", async () => {
    const result = await safe("boom", async () => {
      throw new Error("FAILED_PRECONDITION: index building");
    });
    expect(result).toBeNull();
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(String(errSpy.mock.calls[0]?.[0])).toContain("boom");
  });

  it("swallows synchronous throws inside the thunk too", async () => {
    const result = await safe("sync-boom", () => {
      throw new Error("kaboom");
    });
    expect(result).toBeNull();
  });
});

describe("dashboard load contract (the 260529 regression)", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Simulates the dashboard's load sequence: each section loads behind safe()
  // with a caller-supplied fallback. Even if EVERY underlying loader throws
  // (e.g. a project-wide Firestore outage or several indexes building at once),
  // the page must still end up with render-able defaults — never a 500.
  it("yields render-able defaults when every loader fails", async () => {
    const throwing = async () => {
      throw new Error("FAILED_PRECONDITION");
    };

    const counts =
      (await safe("dashboard counts", throwing)) ?? { clients: 0, templates: 0 };
    const roster = (await safe("client roster", throwing)) ?? [];
    const recentLogs = (await safe("recent logs", throwing)) ?? {
      logs: [],
      clients: [],
    };
    const pulse = await safe("coach pulse", throwing); // CoachPulse | null

    expect(counts).toEqual({ clients: 0, templates: 0 });
    expect(roster).toEqual([]);
    expect(recentLogs).toEqual({ logs: [], clients: [] });
    expect(pulse).toBeNull();
    // The page reads pulse with optional chaining (`pulse?.weekHabitPct ?? 0`),
    // so a null pulse renders the empty pulse cards rather than throwing.
  });

  it("degrades only the failing section, keeps the healthy ones", async () => {
    const counts =
      (await safe("dashboard counts", async () => ({
        clients: 5,
        templates: 3,
      }))) ?? { clients: 0, templates: 0 };
    const recentLogs = (await safe("recent logs", async () => {
      throw new Error("FAILED_PRECONDITION"); // only this one is broken
    })) ?? { logs: [], clients: [] };

    expect(counts).toEqual({ clients: 5, templates: 3 }); // healthy
    expect(recentLogs).toEqual({ logs: [], clients: [] }); // degraded
  });
});
