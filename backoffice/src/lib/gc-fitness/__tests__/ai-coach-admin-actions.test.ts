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
const sets: Array<{ path: string; data: Data }> = [];
/** #504 — every count() aggregation the reader ran, and every projection. */
const counts: string[] = [];
const selects: string[][] = [];
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
          const left =
            f.field === "__name__"
              ? r.path.split("/").pop()
              : f.field.split(".").reduce<unknown>((o, k) => (o as Data | undefined)?.[k], r.data);
          if (left === undefined) return false;
          if (f.op === "in") return (f.value as unknown[]).includes(left);
          if (typeof f.value === "number") {
            const n = left as number;
            return f.op === ">=" ? n >= f.value : f.op === "==" ? n === f.value : false;
          }
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
    select(...fields: string[]) {
      selects.push(fields);
      return q;
    },
    count() {
      return {
        async get() {
          // An aggregation reads no documents: run the query without logging reads.
          const before = reads.length;
          const { docs } = await q.get();
          reads.length = before;
          counts.push(docs.map((d) => d.ref.path).join(","));
          return { data: () => ({ count: docs.length }) };
        },
      };
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
    async set(data: Data) {
      sets.push({ path, data });
      store.set(path, data);
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
    doc: (path: string) => docRef(path),
    collectionGroup: (name: string) => {
      if (failCollectionGroup === name) {
        return {
          where: () => ({ get: async () => { throw new Error("FAILED_PRECONDITION: The query requires an index"); } }),
          orderBy: () => ({
            limit: () => ({ get: async () => { throw new Error("FAILED_PRECONDITION: The query requires an index"); } }),
            count: () => ({ get: async () => { throw new Error("FAILED_PRECONDITION: The query requires an index"); } }),
          }),
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
import {
  loadCorvoDashboard,
  loadCorvoReportContext,
  setCorvoReportTriage,
} from "@/lib/gc-fitness/ai-coach-admin-actions";

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
  sets.length = 0;
  counts.length = 0;
  selects.length = 0;
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
    // #1359: free is measured with the lifetime `total`, premium with today's `count`.
    store.set("ai_coach/u1", { lastMessageAt: recent, usage: { civilDate: today, count: 1, total: 10 } });
    store.set("ai_coach/u2", { lastMessageAt: recent, usage: { civilDate: today, count: 9 } }); // free, no total ⇒ 0
    store.set("ai_coach/u3", { lastMessageAt: recent, usage: { civilDate: today, count: 12, total: 80 } });
    store.set("users/u1", { email: "near@x.com" });
    store.set("users/u3", { email: "prem@x.com", entitlement: { tier: "premium" } });
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
    expect(d.activeUsers.data.last24h).toBe(3);
    expect(d.nearQuota.data.map((r) => [r.uid, r.email, `${r.used}/${r.limit}`, r.reachedQuota])).toEqual([
      ["u1", "near@x.com", "10/10", true],
      ["u3", "prem@x.com", "12/15", false],
    ]);
    expect(d.acceptance.data).toEqual([expect.objectContaining({ type: "routine", shown: 2, applied: 1 })]);
    expect(d.reports.data.filter).toBe("new");
    expect(d.reports.data.rows.map((r) => `${r.uid}/${r.messageId}`)).toEqual(["u1/m10"]);
    // The count() runs over the whole `reports` collection group — it cannot filter
    // by parent path — so a foreign `reports` subcollection (only a test fixture:
    // firestore.rules allows `reports` solely under ai_coach/{uid}) is counted.
    // The LIST still drops it.
    expect(d.reports.data.counts).toEqual({ all: 2, new: 2, reviewed: 0, resolved: 0 });
    // #504 — active users are count() aggregations: no thread doc is read for them,
    // and the proposals read is projected to the two fields the table uses.
    expect(selects).toEqual([["type", "status"]]);
    // The dashboard never reads message text.
    expect(reads.filter((p) => p.includes("/messages/"))).toEqual([]);
  });

  it("a section whose collection-group index is missing fails alone", async () => {
    failCollectionGroup = "reports";
    const d = await loadCorvoDashboard();
    expect(d.reports.ok).toBe(false);
    expect(d.usage.ok).toBe(true);
    expect(d.activeUsers.ok).toBe(true);
    expect(d.acceptance.ok).toBe(true);
  });
});

describe("#504 — reads", () => {
  it("near-quota reads only candidate threads, not every thread active in 30 days", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
    store.set("ai_coach/recent", { lastMessageAt: hoursAgo(1), usage: { civilDate: today, count: 1, total: 1 } });
    store.set("ai_coach/quiet", { lastMessageAt: hoursAgo(24 * 10), usage: { civilDate: "2020-01-01", count: 1, total: 2 } });
    store.set("ai_coach/heavy", { lastMessageAt: hoursAgo(24 * 10), usage: { civilDate: "2020-01-01", count: 1, total: 9 } });
    store.set("ai_coach/old", { lastMessageAt: hoursAgo(24 * 60), usage: { total: 10 } });
    store.set("users/heavy", { email: "heavy@x.com" });
    const d = await loadCorvoDashboard();
    if (!d.nearQuota.ok || !d.activeUsers.ok) throw new Error("expected ok");
    expect(d.activeUsers.data).toEqual({ last24h: 1, last7d: 1, last30d: 3 });
    expect(reads).not.toContain("ai_coach/quiet");
    // Lifetime 9/10 inside the 30-day window is near; 10/10 two months ago is out of it.
    expect(d.nearQuota.data.map((r) => r.uid)).toEqual(["heavy"]);
  });
});

describe("#504 — report triage", () => {
  const recent = () => new Date(Date.now() - 3600_000);
  beforeEach(() => {
    store.set("ai_coach/u1/reports/m1", { reason: "incorrect", note: "", createdAt: recent(), platform: "ios", appVersion: "2.3" });
    store.set("ai_coach/u1/reports/m2", { reason: "other", note: "", createdAt: recent(), platform: "ios", appVersion: "2.3" });
    store.set("ai_coach/u2/reports/m3", { reason: "off_topic", note: "", createdAt: recent(), platform: "android", appVersion: "2.3" });
  });

  it("sets a state + note in the server-only triage collection, never on the report", async () => {
    const r = await setCorvoReportTriage({ uid: "u1", messageId: "m1", status: "reviewed", note: " checked " });
    expect(r).toMatchObject({ ok: true, triage: { status: "reviewed", note: "checked" } });
    expect(sets).toEqual([
      {
        path: "ai_coach_report_triage/u1_m1",
        data: expect.objectContaining({ uid: "u1", messageId: "m1", status: "reviewed", note: "checked", updatedBy: "admin-1" }),
      },
    ]);
    expect(store.get("ai_coach/u1/reports/m1")).not.toHaveProperty("status");
    expect(added).toEqual([
      { collection: "admin_operations", data: expect.objectContaining({ kind: "ai_coach_report_triage", targetUid: "u1" }) },
    ]);
  });

  it("refuses a missing report, a bad status and a non-admin", async () => {
    expect(await setCorvoReportTriage({ uid: "u1", messageId: "nope", status: "reviewed", note: "" })).toEqual({
      ok: false,
      error: "Report not found.",
    });
    expect(await setCorvoReportTriage({ uid: "u1", messageId: "m1", status: "done", note: "" })).toMatchObject({ ok: false });
    mockedAdmin.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(setCorvoReportTriage({ uid: "u1", messageId: "m1", status: "resolved", note: "" })).rejects.toThrow("Forbidden");
    expect(sets).toEqual([]);
  });

  it("filters the list by state and counts each state with count()", async () => {
    await setCorvoReportTriage({ uid: "u1", messageId: "m1", status: "reviewed", note: "x" });
    await setCorvoReportTriage({ uid: "u2", messageId: "m3", status: "resolved", note: "" });

    const fresh = await loadCorvoDashboard();
    if (!fresh.reports.ok) throw new Error("expected ok");
    expect(fresh.reports.data.rows.map((r) => r.messageId)).toEqual(["m2"]);
    expect(fresh.reports.data.counts).toEqual({ all: 3, new: 1, reviewed: 1, resolved: 1 });

    const reviewed = await loadCorvoDashboard({ reportState: "reviewed" });
    if (!reviewed.reports.ok) throw new Error("expected ok");
    expect(reviewed.reports.data.rows.map((r) => [r.messageId, r.triage.status, r.triage.note])).toEqual([
      ["m1", "reviewed", "x"],
    ]);

    const all = await loadCorvoDashboard({ reportState: "all" });
    if (!all.reports.ok) throw new Error("expected ok");
    expect(all.reports.data.rows.map((r) => `${r.messageId}:${r.triage.status}`).sort()).toEqual([
      "m1:reviewed",
      "m2:new",
      "m3:resolved",
    ]);
  });

  it("the context page carries the report's triage", async () => {
    await setCorvoReportTriage({ uid: "u1", messageId: "m1", status: "resolved", note: "fixed prompt" });
    const ctx = await loadCorvoReportContext("u1", "m1");
    if (ctx.kind === "not_found") throw new Error("expected a report");
    expect(ctx.report.triage).toMatchObject({ status: "resolved", note: "fixed prompt" });
  });
});
