// moderation-actions.test.ts — the moderation queue's verbs (gc-fitness #1050).
//
// What is pinned: the admin gate on every verb, WHICH document each verb flips
// (and to what), that resolving closes only the reports that are still open,
// and that every verb leaves an `admin_operations` row with the actor.

jest.mock("@/lib/gc-fitness/auth-helpers", () => ({ getCurrentAdmin: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: jest.fn(() => "SERVER_TIMESTAMP") },
}));

/** A tiny in-memory Firestore: docs by path, plus recorded writes. */
const store = new Map<string, Record<string, unknown>>();
const writes: Array<{ path: string; data: Record<string, unknown>; merge?: boolean; op: string }> = [];
const added: Array<{ collection: string; data: Record<string, unknown> }> = [];

function docRef(path: string) {
  return {
    path,
    get: async () => ({
      exists: store.has(path),
      data: () => store.get(path),
      get: (field: string) => store.get(path)?.[field],
    }),
    set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      writes.push({ path, data, merge: opts?.merge, op: "set" });
      store.set(path, { ...(opts?.merge ? store.get(path) ?? {} : {}), ...data });
    },
    collection: (name: string) => collectionRef(`${path}/${name}`),
  };
}
function collectionRef(path: string) {
  return {
    doc: (id: string) => docRef(`${path}/${id}`),
    add: async (data: Record<string, unknown>) => {
      added.push({ collection: path, data });
      return { id: "op-1" };
    },
  };
}
const batchUpdates: Array<{ path: string; data: Record<string, unknown> }> = [];
let batchCommitted = 0;
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: jest.fn(() => ({
    collection: (name: string) => collectionRef(name),
    batch: () => ({
      update: (ref: { path: string }, data: Record<string, unknown>) => {
        batchUpdates.push({ path: ref.path, data });
        store.set(ref.path, { ...(store.get(ref.path) ?? {}), ...data });
      },
      commit: async () => {
        batchCommitted += 1;
      },
    }),
  })),
  gcFitnessAuth: jest.fn(),
}));

import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import {
  dismissReports,
  hideReportedContent,
  suspendReportedAuthor,
  unsuspendSocialAccount,
} from "@/lib/gc-fitness/moderation-actions";
import { redirect } from "next/navigation";

const mockedGetCurrentAdmin = getCurrentAdmin as jest.MockedFunction<typeof getCurrentAdmin>;
const ADMIN = { uid: "admin-1", email: "a@x.com", role: "admin" as const, isTrainer: false, roles: ["admin"] };

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  jest.clearAllMocks();
  store.clear();
  writes.length = 0;
  added.length = 0;
  batchUpdates.length = 0;
  batchCommitted = 0;
  mockedGetCurrentAdmin.mockResolvedValue(ADMIN);
  store.set("social_reports/r-open", { status: "open", targetType: "routine", targetId: "tpl-1" });
  store.set("social_reports/r-done", { status: "dismissed", targetType: "routine", targetId: "tpl-1" });
  store.set("public_routines/tpl-1", { authorUid: "u-owner", hidden: false });
  store.set("social_profiles/u-owner", { suspended: false });
});

describe("the admin gate", () => {
  it("every verb refuses a non-admin before touching anything", async () => {
    mockedGetCurrentAdmin.mockRejectedValue(new Error("Forbidden"));
    const fd = form({ targetType: "routine", targetId: "tpl-1", targetOwnerUid: "u-owner", reportIds: "r-open" });
    await expect(hideReportedContent(fd)).rejects.toThrow("Forbidden");
    await expect(suspendReportedAuthor(fd)).rejects.toThrow("Forbidden");
    await expect(dismissReports(fd)).rejects.toThrow("Forbidden");
    await expect(unsuspendSocialAccount(form({ uid: "u-owner" }))).rejects.toThrow("Forbidden");
    expect(writes).toHaveLength(0);
    expect(added).toHaveLength(0);
  });
});

describe("hideReportedContent", () => {
  it("flips hidden on the routine card, resolves ONLY the still-open reports, logs the operator", async () => {
    await hideReportedContent(
      form({ targetType: "routine", targetId: "tpl-1", targetOwnerUid: "u-owner", reportIds: "r-open,r-done,r-missing" }),
    );
    expect(writes).toContainEqual({ path: "public_routines/tpl-1", data: { hidden: true, updatedAt: "SERVER_TIMESTAMP" }, merge: true, op: "set" });
    expect(batchUpdates.map((u) => u.path)).toEqual(["social_reports/r-open"]);
    expect(batchUpdates[0].data).toMatchObject({ status: "actioned", resolution: "hide", resolvedBy: "admin-1" });
    expect(batchCommitted).toBe(1);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      collection: "admin_operations",
      data: { actorUid: "admin-1", kind: "moderation_hide", targetUid: "u-owner", status: "success", summary: { targetType: "routine", targetId: "tpl-1", resolvedReports: 1 } },
    });
    expect(redirect).toHaveBeenCalledWith("/gc-fitness/admin/moderation?op=hide&ok=1");
  });

  it("a message target is addressed as dm_threads/{t}/messages/{m}", async () => {
    await hideReportedContent(form({ targetType: "message", targetId: "a_b/m1", targetOwnerUid: "b", reportIds: "" }));
    expect(writes[0].path).toBe("dm_threads/a_b/messages/m1");
    expect(writes[0].data).toEqual({ hidden: true });
  });

  it("a comment gets hidden without touching its text", async () => {
    store.set("routine_comments/c1", { text: "hola", hidden: false, deleted: false });
    await hideReportedContent(form({ targetType: "comment", targetId: "c1", targetOwnerUid: "u", reportIds: "" }));
    expect(writes[0]).toMatchObject({ path: "routine_comments/c1", data: { hidden: true }, merge: true });
    expect(store.get("routine_comments/c1")).toMatchObject({ text: "hola", hidden: true });
  });

  it("a profile cannot be hidden — it is suspended — and the failure is logged", async () => {
    await expect(
      hideReportedContent(form({ targetType: "profile", targetId: "u-owner", targetOwnerUid: "u-owner", reportIds: "r-open" })),
    ).rejects.toThrow("suspended");
    expect(added[0]).toMatchObject({ data: { kind: "moderation_hide", status: "failed" } });
    expect(batchCommitted).toBe(0);
  });
});

describe("suspendReportedAuthor", () => {
  it("flips suspended on the OWNER's profile (the trigger fans authorSuspended out), never the reporter's", async () => {
    await suspendReportedAuthor(form({ targetType: "comment", targetId: "c1", targetOwnerUid: "u-owner", reportIds: "r-open" }));
    expect(writes).toContainEqual({ path: "social_profiles/u-owner", data: { suspended: true, updatedAt: "SERVER_TIMESTAMP" }, merge: true, op: "set" });
    expect(writes.filter((w) => w.path.startsWith("public_routines"))).toHaveLength(0);
    expect(added[0]).toMatchObject({ data: { kind: "moderation_suspend", targetUid: "u-owner", summary: { suspendedUid: "u-owner" } } });
  });

  it("refuses without an owner uid rather than suspending nobody", async () => {
    await expect(
      suspendReportedAuthor(form({ targetType: "routine", targetId: "tpl-1", targetOwnerUid: "", reportIds: "r-open" })),
    ).rejects.toThrow("owner");
    expect(store.get("social_reports/r-open")?.status).toBe("open");
  });
});

describe("dismissReports", () => {
  it("touches no content: only the reports close, as dismissed", async () => {
    await dismissReports(form({ targetType: "routine", targetId: "tpl-1", targetOwnerUid: "u-owner", reportIds: "r-open" }));
    expect(writes).toHaveLength(0);
    expect(batchUpdates[0].data).toMatchObject({ status: "dismissed", resolution: "dismiss" });
    expect(added[0]).toMatchObject({ data: { kind: "moderation_dismiss", status: "success" } });
  });
});

describe("unsuspendSocialAccount", () => {
  it("is the reverse flag with its own operation row", async () => {
    store.set("social_profiles/u-owner", { suspended: true });
    await unsuspendSocialAccount(form({ uid: "u-owner" }));
    expect(store.get("social_profiles/u-owner")).toMatchObject({ suspended: false });
    expect(added[0]).toMatchObject({ data: { kind: "moderation_unsuspend", targetUid: "u-owner" } });
  });
});
