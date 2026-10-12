// ai-coach-admin-actions.test.ts — the reader behind /gc-fitness/admin/corvo (#1330).
//
// What is pinned:
//   • the admin gate on both readers, before any read;
//   • a conversation is readable ONLY through a report: no report doc → no
//     message read at all;
//   • the context is the ≤6 messages strictly BEFORE the reported one (by
//     createdAt), never anything after it;
//   • a deleted conversation (message gone, report kept) → "deleted";
//   • every context read leaves an admin_operations row with the actor;
//   • collection-group results outside ai_coach/* are ignored;
//   • a failing section (e.g. a missing collection-group index) does not take
//     the page down.

jest.mock("@/lib/gc-fitness/auth-helpers", () => ({ getCurrentAdmin: jest.fn() }));
jest.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: jest.fn(() => "SERVER_TIMESTAMP") },
  FieldPath: { documentId: jest.fn(() => "__name__") },
}));

type Data = Record<string, unknown>;
const store = new Map<string, Data>();
const reads: string[] = [];
const added: Array<{ collection: string; data: Data }> = [];
let failCollectionGroup: string | null = null;

const ts = (iso: string) => ({ toMillis: () => Date.parse(iso), iso });
const msOf = (v: unknown): number => {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === "function") return (v as { toMillis: () => number }).toMillis();
  if (v instanceof Date) return v.getTime();
  return NaN;
};
const compare = (a: unknown, b: unknown): number => {
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  return msOf(a) - msOf(b);
};

function snapOf(path: string, d: Data) {
  const id = path.split("/").pop()!;
  return { id, ref: { path }, data: () => d };
}

/** Query over a set of candidate paths, supporting the shapes the reader uses. */
function makeQuery(candidates: () => string[]) {
  const filters: Array<{ field: string; op: string; value: unknown }> = [];
  let order: { field: string; dir: string } | null = null;
  let lim = Infinity;
  const q = {
    where(field: string, op: string, value: unknown) {
      filters.push({ field, op, value });
      return q;
    },
    orderBy(field: string, dir = "asc") {
      order = { field, dir };
      return q;
    },
    limit(n: number) {
      lim = n;
      return q;
    },
    async get() {
      let rows = candidates().map((p) => ({ path: p, data: store.get(p)! }));
      for (const f of filters) {
        rows = rows.filter((r) => {
          const left = f.field === "__name__" ? r.path.split("/").pop() : r.data[f.field];
          if (left === undefined) return false;
          const c = compare(left, f.value);
          return f.op === ">=" ? c >= 0 : f.op === "<" ? c < 0 : f.op === "==" ? c === 0 : false;
        });
      }
      if (order) {
        const { field, dir } = order;
        rows.sort((a, b) => compare(a.data[field], b.data[field]) * (dir === "desc" ? -1 : 1));
      }
      rows = rows.slice(0, lim);
      rows.forEach((r) => reads.push(r.path));
      return { docs: rows.map((r) => snapOf(r.path, r.data)) };
    },
  };
  return q;
}

function children(collectionPath: string): string[] {
  const depth = collectionPath.split("/").length + 1;
  return Array.from(store.keys()).filter((p) => p.startsWith(`${collectionPath}/`) && p.split("/").length === depth);
}

function docRef(path: string) {
  return {
    path,
    async get() {
      reads.push(path);
      const d = store.get(path);
      return { exists: d !== undefined, id: path.split("/").pop(), data: () => d };
    },
    collection: (name: string) => collectionRef(`${path}/${name}`),
  };
}
function collectionRef(path: string) {
  const base = makeQuery(() => children(path));
  return {
    ...base,
    where: (...a: Parameters<typeof base.where>) => makeQuery(() => children(path)).where(...a),
    orderBy: (...a: Parameters<typeof base.orderBy>) => makeQuery(() => children(path)).orderBy(...a),
    doc: (id: string) => docRef(`${path}/${id}`),
    add: async (data: Data) => {
      added.push({ collection: path, data });
      return { id: "op-1" };
    },
  };
}

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: jest.fn(() => ({
    collection: (name: string) => collectionRef(name),
    collectionGroup: (name: string) => {
      if (failCollectionGroup === name) {
        return {
          where: () => ({ get: async () => { throw new Error("FAILED_PRECONDITION: The query requires an index"); } }),
          orderBy: () => ({ limit: () => ({ get: async () => { throw new Error("FAILED_PRECONDITION: The query requires an index"); } }) }),
        };
      }
      return makeQuery(() =>
        Array.from(store.keys()).filter((p) => {
          const parts = p.split("/");
          return parts.length >= 2 && parts.length % 2 === 0 && parts[parts.length - 2] === name;
        }),
      );
    },
  })),
}));

import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { loadCorvoDashboard, loadCorvoReportContext } from "@/lib/gc-fitness/ai-coach-admin-actions";

const mockedAdmin = getCurrentAdmin as jest.MockedFunction<typeof getCurrentAdmin>;
const ADMIN = { uid: "admin-1", email: "a@x.com", role: "admin" as const, isTrainer: false, roles: ["admin"] };

function seedConversation(uid: string, count: number) {
  // m01..mNN, one minute apart; the reported one is in the middle.
  for (let i = 1; i <= count; i += 1) {
    const id = `m${String(i).padStart(2, "0")}`;
    store.set(`ai_coach/${uid}/messages/${id}`, {
      role: i % 2 === 1 ? "user" : "assistant",
      text: `text ${id}`,
      status: i % 2 === 1 ? "sent" : "done",
      createdAt: ts(`2026-10-11T10:${String(i).padStart(2, "0")}:00Z`),
    });
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  store.clear();
  reads.length = 0;
  added.length = 0;
  failCollectionGroup = null;
  mockedAdmin.mockResolvedValue(ADMIN);
});

describe("the admin gate", () => {
  it("both readers refuse a non-admin before reading anything", async () => {
    mockedAdmin.mockRejectedValue(new Error("Forbidden"));
    store.set("ai_coach/u1/reports/m10", { reason: "incorrect" });
    await expect(loadCorvoDashboard()).rejects.toThrow("Forbidden");
    await expect(loadCorvoReportContext("u1", "m10")).rejects.toThrow("Forbidden");
    expect(reads).toHaveLength(0);
    expect(added).toHaveLength(0);
  });
});

describe("loadCorvoReportContext", () => {
  it("without a report doc it reads NO message and logs nothing", async () => {
    seedConversation("u1", 12);
    const ctx = await loadCorvoReportContext("u1", "m10");
    expect(ctx).toEqual({ kind: "not_found" });
    expect(reads.filter((p) => p.includes("/messages/"))).toEqual([]);
    expect(added).toHaveLength(0);
  });

  it("returns the 6 previous messages in order + the reported one, nothing after, and logs the read", async () => {
    seedConversation("u1", 12);
    store.set("users/u1", { email: "user@x.com" });
    store.set("ai_coach/u1/reports/m10", {
      messageId: "m10",
      reason: "inappropriate",
      note: "rude",
      createdAt: ts("2026-10-11T11:00:00Z"),
      platform: "android",
      appVersion: "1.7.0 (190)",
    });
    const ctx = await loadCorvoReportContext("u1", "m10");
    if (ctx.kind !== "ok") throw new Error(`expected ok, got ${ctx.kind}`);
    expect(ctx.messages.map((m) => m.id)).toEqual(["m04", "m05", "m06", "m07", "m08", "m09", "m10"]);
    expect(ctx.messages[6].isReported).toBe(true);
    expect(reads.some((p) => /messages\/m1[12]$/.test(p))).toBe(false);
    expect(ctx.report).toMatchObject({ uid: "u1", messageId: "m10", reason: "inappropriate", email: "user@x.com", platform: "android" });
    expect(added).toEqual([
      {
        collection: "admin_operations",
        data: expect.objectContaining({ actorUid: "admin-1", kind: "ai_coach_report_view", targetUid: "u1" }),
      },
    ]);
  });

  it("a deleted conversation keeps the report and says so", async () => {
    store.set("ai_coach/u1/reports/m10", { reason: "incorrect", note: "" });
    const ctx = await loadCorvoReportContext("u1", "m10");
    expect(ctx.kind).toBe("deleted");
  });

  it("rejects path-shaped ids", async () => {
    store.set("ai_coach/u1/reports/m10", { reason: "incorrect" });
    expect(await loadCorvoReportContext("u1/reports", "m10")).toEqual({ kind: "not_found" });
    expect(reads).toHaveLength(0);
  });
});

describe("loadCorvoDashboard", () => {
  it("shapes every section from the server docs", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const recent = new Date(Date.now() - 3600_000);
    store.set(`ai_coach_usage/${today}`, { turns: 4, estimatedMicroUsd: 90_000, latencyMsTotal: 8000, errors: { upstream: 1 } });
    store.set("ai_coach_usage/2020-01-01", { turns: 999, estimatedMicroUsd: 999_999_999 });
    store.set("ai_coach/u1", { lastMessageAt: recent, usage: { civilDate: today, count: 5 } });
    store.set("ai_coach/u2", { lastMessageAt: recent, usage: { civilDate: today, count: 1 } });
    store.set("users/u1", { email: "near@x.com" });
    store.set("ai_coach/u1/proposals/p1", { type: "routine", status: "applied", createdAt: recent });
    store.set("ai_coach/u1/proposals/p2", { type: "routine", status: "dismissed", createdAt: recent });
    store.set("other/u9/proposals/px", { type: "routine", status: "applied", createdAt: recent });
    store.set("ai_coach/u1/reports/m10", { reason: "off_topic", note: "", createdAt: recent, platform: "ios", appVersion: "1.7" });
    store.set("social_profiles/u5/reports/zz", { reason: "spam", createdAt: recent });

    const d = await loadCorvoDashboard();
    if (!d.usage.ok || !d.activeUsers.ok || !d.nearQuota.ok || !d.acceptance.ok || !d.reports.ok) {
      throw new Error("expected every section ok");
    }
    expect(d.usage.data.series).toHaveLength(30);
    expect(d.usage.data.summary.cost30dMicroUsd).toBe(90_000); // the 2020 doc is outside the window
    expect(d.usage.data.summary.today.turns).toBe(4);
    expect(d.activeUsers.data.last24h).toBe(2);
    expect(d.nearQuota.data.map((r) => [r.uid, r.email, r.reachedQuota])).toEqual([["u1", "near@x.com", true]]);
    expect(d.acceptance.data).toEqual([expect.objectContaining({ type: "routine", shown: 2, applied: 1 })]);
    expect(d.reports.data.map((r) => `${r.uid}/${r.messageId}`)).toEqual(["u1/m10"]);
    // The dashboard never reads message text.
    expect(reads.filter((p) => p.includes("/messages/"))).toEqual([]);
  });

  it("a section whose collection-group index is missing fails alone", async () => {
    failCollectionGroup = "reports";
    const d = await loadCorvoDashboard();
    expect(d.reports.ok).toBe(false);
    expect(d.usage.ok).toBe(true);
    expect(d.acceptance.ok).toBe(true);
  });
});
