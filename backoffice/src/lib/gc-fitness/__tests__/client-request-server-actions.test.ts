// client-request-server-actions.test.ts — the "request weight / progress
// photos" Server Actions. (client-request-actions.test.ts already pins the pure
// TTL state; this file pins the I/O + authorization.) `clientId` and `kind`
// arrive through `.bind`, which the browser can alter, so the ownership
// re-check in `runClientRequest` is the only gate.

jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-cov-a").firestoreModuleMock,
);
jest.mock("@/lib/firebase/gc-fitness-admin", () => {
  const f = jest.requireActual("@/lib/test-utils/fake-firestore-cov-a");
  return { gcFitnessFirestore: () => f.fake.db, gcFitnessStorage: () => f.fake.storage };
});

const mockGetCurrentTrainer = jest.fn();
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: () => mockGetCurrentTrainer(),
}));
const mockRevalidatePath = jest.fn();
jest.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

import { SERVER_TIMESTAMP, fake } from "@/lib/test-utils/fake-firestore-cov-a";

import { submitClientRequest } from "@/app/gc-fitness/clients/[id]/_components/client-request-form-actions";
import { runClientRequest } from "../client-request-actions";
import { CLIENT_REQUEST_TTL_MS } from "../client-request-state";

const COACH = "coach-A";
const OTHER = "coach-B";

beforeEach(() => {
  fake.reset();
  mockRevalidatePath.mockReset();
  mockGetCurrentTrainer.mockReset();
  mockGetCurrentTrainer.mockResolvedValue({ uid: COACH, email: "a@example.com" });
  fake.seed({
    "users/client-1": { role: "client", coachId: COACH, displayName: "  Ana  ", email: "ana@x.com" },
    "users/client-2": { role: "client", coachId: OTHER },
    "users/client-3": { role: "client", coachId: COACH, displayName: " ", email: "beto@x.com" },
    "users/client-4": { role: "client", coachId: COACH },
  });
});

describe("runClientRequest", () => {
  it("rejects a non-trainer before any read", async () => {
    mockGetCurrentTrainer.mockRejectedValue(new Error("Forbidden"));
    await expect(runClientRequest("client-1", "weight")).rejects.toThrow("Forbidden");
    expect(fake.db.reads).toEqual([]);
    expect(fake.db.writes).toEqual([]);
  });

  it.each([
    ["another coach's client", "client-2"],
    ["a missing client", "ghost"],
  ])("rejects %s and writes nothing", async (_n, clientId) => {
    await expect(runClientRequest(clientId, "progressPhotos")).rejects.toThrow("Forbidden");
    expect(fake.db.writes).toEqual([]);
  });

  it("stamps bodyWeightRequestedAt and records a weight_request activity event", async () => {
    const res = await runClientRequest("client-1", "weight");
    expect(res).toEqual({ ok: true, skipped: false, requestedAt: expect.any(String) });
    const at = new Date(res.requestedAt as string);
    expect(fake.db.writes[0]).toEqual({
      op: "update",
      path: "users/client-1",
      data: { bodyWeightRequestedAt: at, updatedAt: SERVER_TIMESTAMP },
    });
    expect(fake.db.writes[1].path).toBe(`coach_activity/req:weight:client-1:${res.requestedAt}`);
    expect(fake.db.writes[1].data).toMatchObject({
      trainerId: COACH,
      kind: "weight_request",
      title: "Pedir peso: Ana",
      clientId: "client-1",
    });
    expect(fake.db.writes).toHaveLength(2);
  });

  it("progressPhotos stamps progressPhotosRequestedAt; name falls back to email then uid", async () => {
    const r3 = await runClientRequest("client-3", "progressPhotos");
    expect(fake.db.writes[0].data).toEqual({
      progressPhotosRequestedAt: new Date(r3.requestedAt as string),
      updatedAt: SERVER_TIMESTAMP,
    });
    expect(fake.db.writes[1].data).toMatchObject({
      kind: "progress_photo_request",
      title: "Pedir fotos de progreso: beto@x.com",
    });
    await runClientRequest("client-4", "progressPhotos");
    expect(fake.db.writes[3].data).toMatchObject({ title: "Pedir fotos de progreso: client-4" });
  });

  it("skips (no write) while a previous request of the same kind is still active", async () => {
    const recent = new Date(Date.now() - CLIENT_REQUEST_TTL_MS / 2);
    fake.seed({ "users/client-1": { coachId: COACH, bodyWeightRequestedAt: recent } });
    await expect(runClientRequest("client-1", "weight")).resolves.toEqual({
      ok: true,
      skipped: true,
      requestedAt: recent.toISOString(),
    });
    expect(fake.db.writes).toEqual([]);
  });
});

describe("submitClientRequest (form action)", () => {
  it("rejects another coach's client: no write, no revalidation", async () => {
    await expect(submitClientRequest("client-2", "weight")).rejects.toThrow("Forbidden");
    expect(fake.db.writes).toEqual([]);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("runs the request and revalidates the client page + my-activity", async () => {
    await submitClientRequest("client-1", "progressPhotos");
    expect(fake.doc("users/client-1")?.progressPhotosRequestedAt).toBeInstanceOf(Date);
    expect(mockRevalidatePath.mock.calls).toEqual([
      ["/gc-fitness/clients/client-1"],
      ["/gc-fitness/my-activity"],
    ]);
  });
});
