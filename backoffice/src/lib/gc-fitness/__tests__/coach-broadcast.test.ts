// coach-broadcast.test.ts — golden-crow-website #500, «Mandar mensaje» desde
// el roster.
//
// What is pinned:
//   • the URL is the gc-fitness callable `broadcastCoachMessage` (one source
//     of truth for the rules — mdb1/gc-fitness#1617);
//   • every callable error body maps to a kind the UI has copy for, and the
//     daily cap is recognized by status OR reason;
//   • selection: pending invites (`mirror:` / pendingProvisioning) are never
//     selectable; the header checkbox is tri-state over the VISIBLE rows;
//   • `?clients=` round-trips and is filtered to the coach's own roster;
//   • the Server Action POSTs `{ data: { clientIds, text } }` with the coach's
//     own ID token and RETURNS every failure (never throws, #1104), and never
//     sends another person's uid back to the browser (skipped → a count).

jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainerIdToken: jest.fn(),
}));

import { getCurrentTrainerIdToken } from "@/lib/gc-fitness/auth-helpers";
import { sendCoachBroadcast } from "@/lib/gc-fitness/coach-broadcast-actions";
import {
  BROADCAST_MAX_RECIPIENTS,
  BROADCAST_TEXT_MAX,
  broadcastCallableUrl,
  broadcastDraftProblem,
  bulkScheduleHref,
  classifyBroadcastError,
  decodeBroadcastResult,
  isBulkSelectable,
  parsePreselectedClients,
  selectAllState,
  toggleAllVisible,
} from "@/lib/gc-fitness/coach-broadcast-model";

const mockedIdToken = getCurrentTrainerIdToken as jest.Mock;

describe("broadcastCallableUrl", () => {
  test("points at the gc-fitness callable", () => {
    expect(broadcastCallableUrl("gcfitness-3476b")).toBe(
      "https://us-central1-gcfitness-3476b.cloudfunctions.net/broadcastCoachMessage",
    );
  });
});

describe("classifyBroadcastError", () => {
  test.each([
    ["RESOURCE_EXHAUSTED", { reason: "daily_cap", limit: 10 }, "daily_cap"],
    ["RESOURCE_EXHAUSTED", undefined, "daily_cap"],
    ["PERMISSION_DENIED", undefined, "forbidden"],
    ["UNAUTHENTICATED", undefined, "forbidden"],
    ["INVALID_ARGUMENT", { reason: "text" }, "text"],
    ["INVALID_ARGUMENT", { reason: "recipients", max: 200 }, "recipients"],
    ["INVALID_ARGUMENT", undefined, "generic"],
    ["INTERNAL", undefined, "generic"],
    [undefined, undefined, "generic"],
  ])("%s %j → %s", (status, details, kind) => {
    expect(classifyBroadcastError(status, details)).toBe(kind);
  });
});

describe("decodeBroadcastResult", () => {
  test("decodes the success contract", () => {
    expect(
      decodeBroadcastResult({ ok: true, broadcastId: "b1", sent: 3, skipped: ["x"], remaining: 7 }),
    ).toEqual({ broadcastId: "b1", sent: 3, skipped: ["x"], remaining: 7 });
  });
  test("rejects malformed bodies", () => {
    expect(decodeBroadcastResult(null)).toBeNull();
    expect(decodeBroadcastResult({ ok: false })).toBeNull();
    expect(decodeBroadcastResult({ ok: true })).toBeNull();
  });
});

describe("broadcastDraftProblem (UX mirror of the callable's checks)", () => {
  test("recipients 1..200", () => {
    expect(broadcastDraftProblem("hola", 0)).toBe("no_recipients");
    expect(broadcastDraftProblem("hola", BROADCAST_MAX_RECIPIENTS)).toBeNull();
    expect(broadcastDraftProblem("hola", BROADCAST_MAX_RECIPIENTS + 1)).toBe("too_many");
  });
  test("text 1..1000 after trim", () => {
    expect(broadcastDraftProblem("   ", 1)).toBe("empty");
    expect(broadcastDraftProblem("a".repeat(BROADCAST_TEXT_MAX), 1)).toBeNull();
    expect(broadcastDraftProblem(`  ${"a".repeat(BROADCAST_TEXT_MAX)}  `, 1)).toBeNull();
    expect(broadcastDraftProblem("a".repeat(BROADCAST_TEXT_MAX + 1), 1)).toBe("too_long");
  });
});

describe("selection", () => {
  test("pending invites are never selectable", () => {
    expect(isBulkSelectable({ uid: "ana", pendingProvisioning: false })).toBe(true);
    expect(isBulkSelectable({ uid: "mirror:ana@x.com", pendingProvisioning: true })).toBe(false);
    expect(isBulkSelectable({ uid: "mirror:ana@x.com", pendingProvisioning: false })).toBe(false);
    expect(isBulkSelectable({ uid: "ana", pendingProvisioning: true })).toBe(false);
  });

  test("header state is tri-state over the visible ids", () => {
    expect(selectAllState(new Set(), [])).toBe(false);
    expect(selectAllState(new Set(["a"]), ["a", "b"])).toBe("indeterminate");
    expect(selectAllState(new Set(["a", "b", "hidden"]), ["a", "b"])).toBe(true);
    expect(selectAllState(new Set(["hidden"]), ["a", "b"])).toBe(false);
  });

  test("toggle-all adds the visible ones, then removes only those", () => {
    const added = toggleAllVisible(new Set(["hidden", "a"]), ["a", "b"]);
    expect([...added].sort()).toEqual(["a", "b", "hidden"]);
    const removed = toggleAllVisible(added, ["a", "b"]);
    expect([...removed]).toEqual(["hidden"]);
  });
});

describe("/schedule/bulk preselection", () => {
  test("href round-trips through the parser", () => {
    const href = bulkScheduleHref(["u1", "u2", "mirror:x@y.com"]);
    expect(href).toBe("/gc-fitness/schedule/bulk?clients=u1%2Cu2");
    const param = new URL(href, "https://x").searchParams.get("clients") ?? undefined;
    expect(parsePreselectedClients(param, ["u1", "u2"])).toEqual(["u1", "u2"]);
  });

  test("no ids → plain route", () => {
    expect(bulkScheduleHref([])).toBe("/gc-fitness/schedule/bulk");
  });

  test("keeps only the coach's own clients, de-duplicated", () => {
    expect(parsePreselectedClients(" u1,,u3, u1 ,stranger", ["u1", "u3"])).toEqual(["u1", "u3"]);
    expect(parsePreselectedClients(["u1", "u3"], ["u3"])).toEqual(["u3"]);
    expect(parsePreselectedClients(undefined, ["u1"])).toEqual([]);
  });
});

describe("sendCoachBroadcast (Server Action)", () => {
  const originalFetch = global.fetch;
  const originalProject = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID = "gcfitness-3476b";
    mockedIdToken.mockReset();
    mockedIdToken.mockResolvedValue({ uid: "coach", idToken: "ID-TOKEN" });
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    global.fetch = originalFetch;
    if (originalProject === undefined) {
      delete process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
    } else {
      process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID = originalProject;
    }
    jest.restoreAllMocks();
  });

  test("POSTs clientIds + text with the coach's own ID token", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        result: { ok: true, broadcastId: "b1", sent: 2, skipped: ["gone-uid"], remaining: 9 },
      }),
    });
    const result = await sendCoachBroadcast(["u1", "u2", "gone-uid"], "Hola equipo");
    // Only a COUNT of skipped comes back — never another person's uid.
    expect(result).toEqual({ ok: true, sent: 2, skipped: 1, remaining: 9 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://us-central1-gcfitness-3476b.cloudfunctions.net/broadcastCoachMessage",
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer ID-TOKEN");
    expect(JSON.parse(init.body)).toEqual({
      data: { clientIds: ["u1", "u2", "gone-uid"], text: "Hola equipo" },
    });
  });

  test("daily cap comes back as a value", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({
        error: { status: "RESOURCE_EXHAUSTED", message: "x", details: { reason: "daily_cap", limit: 10 } },
      }),
    });
    await expect(sendCoachBroadcast(["u1"], "hola")).resolves.toEqual({
      ok: false,
      error: "daily_cap",
    });
  });

  test("forbidden / non-JSON body / network error never throw", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { status: "PERMISSION_DENIED", message: "Not your clients" } }),
    });
    await expect(sendCoachBroadcast(["u1"], "hola")).resolves.toEqual({ ok: false, error: "forbidden" });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    });
    await expect(sendCoachBroadcast(["u1"], "hola")).resolves.toEqual({ ok: false, error: "generic" });
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(sendCoachBroadcast(["u1"], "hola")).resolves.toEqual({ ok: false, error: "generic" });
  });

  test("no trainer session → forbidden, no request sent", async () => {
    mockedIdToken.mockRejectedValue(new Error("Forbidden"));
    await expect(sendCoachBroadcast(["u1"], "hola")).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("missing project id → generic, no request sent", async () => {
    delete process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
    await expect(sendCoachBroadcast(["u1"], "hola")).resolves.toEqual({ ok: false, error: "generic" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
