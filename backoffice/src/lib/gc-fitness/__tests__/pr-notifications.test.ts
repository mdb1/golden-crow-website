// #489 — the notifications PR feed read `workout_logs where trainerId limit(150)` with
// no orderBy (an ARBITRARY slice: busy coaches missed their newest PRs) and then ran one
// 200-log query per PR to find the record it beat. Now: roster logs newest-first in
// `clientId in` chunks, and the beaten record comes from the stored prs[] already read.

import { FakeFirestore, FakeTimestamp } from "@/lib/test-utils/fake-firestore-c";

import {
  PR_FEED_LOGS_PER_CHUNK,
  PR_FEED_SIZE,
  buildPrNotifications,
  listRecentPrWorkoutNotifications,
} from "../pr-notifications";

const COACH = "coach-a";
const fmtPrev = (v: string) => `(antes ${v})`;
const at = (iso: string) => FakeTimestamp.fromDate(new Date(iso));

function prLog(id: string, clientId: string, iso: string, over: Record<string, unknown> = {}) {
  return {
    trainerId: COACH,
    clientId,
    clientName: clientId,
    status: "completed",
    startedAt: at(iso),
    completedAt: at(iso),
    templateSnapshot: { name: { es: "Piernas" }, exercises: [{ exerciseId: "squat", name: { es: "Sentadilla" } }] },
    sets: [{ id: `${id}-s1`, exerciseId: "squat", weight_kg: 100, reps: 5 }],
    prs: [{ exerciseId: "squat", weight_kg: 100, reps: 5, estimated_one_rm: 116.7, set_log_id: `${id}-s1`, achieved_at: at(iso) }],
    ...over,
  };
}

let db: FakeFirestore;
beforeEach(() => {
  db = new FakeFirestore();
});

describe("listRecentPrWorkoutNotifications (#489)", () => {
  it("reads the roster's logs NEWEST FIRST in chunks of ≤30, one query per chunk, no per-PR query", async () => {
    const roster = new Set(Array.from({ length: 45 }, (_, i) => `c${String(i).padStart(2, "0")}`));
    roster.add("mirror:pending@x.com");
    await listRecentPrWorkoutNotifications(db as never, COACH, roster, fmtPrev);
    expect(db.queries).toHaveLength(2);
    for (const q of db.queries) {
      expect(q.collection).toBe("workout_logs");
      expect(q.filters[0]).toMatchObject({ field: "clientId", op: "in" });
      expect((q.filters[0].value as string[]).length).toBeLessThanOrEqual(30);
      expect((q.filters[0].value as string[])).not.toContain("mirror:pending@x.com");
      expect(q.orderBy).toEqual([{ field: "startedAt", dir: "desc" }]);
      expect(q.limit).toBe(PR_FEED_LOGS_PER_CHUNK);
    }
  });

  it("returns the NEWEST PRs even when the coach has far more logs than the window", async () => {
    // 200 old PR-less logs + 3 fresh PR logs: an unordered slice could miss the fresh ones.
    for (let i = 0; i < 200; i += 1) {
      db.seed(`workout_logs/old-${i}`, prLog(`old-${i}`, "c1", `2026-01-01T00:${String(i % 60).padStart(2, "0")}:00Z`, { prs: [] }));
    }
    db.seed("workout_logs/new-1", prLog("new-1", "c1", "2026-06-10T10:00:00Z"));
    db.seed("workout_logs/new-2", prLog("new-2", "c1", "2026-06-11T10:00:00Z"));
    const out = await listRecentPrWorkoutNotifications(db as never, COACH, new Set(["c1"]), fmtPrev);
    expect(out.map((n) => n.id)).toEqual(["pr:new-2", "pr:new-1"]);
    expect(db.queries).toHaveLength(1);
  });
});

describe("buildPrNotifications (#489)", () => {
  const opts = { trainerUid: COACH, rosterUids: new Set(["c1", "c2"]), formatPrevious: fmtPrev };

  it("resolves the beaten record from the stored prs[] of earlier fetched logs", () => {
    const logs = [
      { id: "l2", data: prLog("l2", "c1", "2026-06-11T10:00:00Z", {
        sets: [{ id: "l2-s1", exerciseId: "squat", weight_kg: 110, reps: 5 }],
        prs: [{ exerciseId: "squat", weight_kg: 110, reps: 5, estimated_one_rm: 128.3, set_log_id: "l2-s1", achieved_at: at("2026-06-11T10:00:00Z") }],
      }) },
      { id: "l1", data: prLog("l1", "c1", "2026-06-01T10:00:00Z") },
    ];
    const [first, second] = buildPrNotifications(logs, opts);
    expect(first.id).toBe("pr:l2");
    expect(first.detailItems).toEqual(["Sentadilla: 110 kg x 5 (128.3 kg 1RM) (antes 100 kg x 5)"]);
    // The oldest PR in the window has no earlier record → no suffix.
    expect(second.detailItems).toEqual(["Sentadilla: 100 kg x 5 (116.7 kg 1RM)"]);
  });

  it("keeps the scope: current roster only, this coach's logs only, completed, not deleted, top 10", () => {
    const logs = [
      { id: "gone", data: prLog("gone", "transferred", "2026-06-12T00:00:00Z") },
      { id: "other-coach", data: prLog("other-coach", "c1", "2026-06-12T00:00:00Z", { trainerId: "coach-b" }) },
      { id: "deleted", data: prLog("deleted", "c1", "2026-06-12T00:00:00Z", { deleted: true }) },
      { id: "started", data: prLog("started", "c1", "2026-06-12T00:00:00Z", { status: "started", completedAt: null }) },
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `ok-${i}`,
        data: prLog(`ok-${i}`, "c2", `2026-06-${String(i + 1).padStart(2, "0")}T00:00:00Z`),
      })),
    ];
    const out = buildPrNotifications(logs, opts);
    expect(out).toHaveLength(PR_FEED_SIZE);
    expect(out[0].id).toBe("pr:ok-11");
    expect(out.map((n) => n.id)).not.toEqual(expect.arrayContaining(["pr:gone", "pr:other-coach", "pr:deleted", "pr:started"]));
  });
});
