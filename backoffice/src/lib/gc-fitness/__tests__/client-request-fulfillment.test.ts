// __tests__/client-request-fulfillment.test.ts
//
// "Pedidos al cliente": is a coach's photo / weight request already fulfilled?
// Fulfilled iff the client's latest upload is STRICTLY after the request.
// Pinned: every accepted timestamp shape, the strictness, the createdAt→takenAt
// fallback, that `checkInDate` (client-picked, backdatable) can never fulfil,
// and fail-soft on the single body-weight read.

import { FakeFirestore, FakeTimestamp } from "@/lib/test-utils/fake-firestore-c";

const mockDb: { current: FakeFirestore | null } = { current: null };
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
}));

import {
  bodyWeightFulfillment,
  progressPhotosFulfillment,
} from "../client-request-fulfillment";
import type { ProgressPhotoRow } from "../progress-photo-actions";

function photo(overrides: Partial<ProgressPhotoRow>): ProgressPhotoRow {
  return {
    id: "p",
    caption: null,
    storagePath: "x",
    url: null,
    angle: null,
    checkInDate: null,
    setId: null,
    createdAt: null,
    takenAt: null,
    ...overrides,
  };
}

const REQ = "2026-06-10T12:00:00.000Z";
const NOT = { fulfilled: false, fulfilledAt: null };

beforeEach(() => {
  mockDb.current = new FakeFirestore();
});

describe("progressPhotosFulfillment (no read — uses the loaded photos)", () => {
  it("fulfilled by the LATEST upload after the request", () => {
    expect(
      progressPhotosFulfillment(REQ, [
        photo({ createdAt: "2026-06-11T09:00:00.000Z" }),
        photo({ createdAt: "2026-06-12T09:00:00.000Z" }),
        photo({ createdAt: "2026-06-01T09:00:00.000Z" }),
      ]),
    ).toEqual({ fulfilled: true, fulfilledAt: "2026-06-12T09:00:00.000Z" });
  });

  it("an upload at exactly the request instant does NOT count (strictly after)", () => {
    expect(progressPhotosFulfillment(REQ, [photo({ createdAt: REQ })])).toEqual(NOT);
  });

  it("falls back to takenAt when createdAt is missing", () => {
    expect(
      progressPhotosFulfillment(REQ, [photo({ createdAt: null, takenAt: "2026-06-11T00:00:00.000Z" })]),
    ).toEqual({ fulfilled: true, fulfilledAt: "2026-06-11T00:00:00.000Z" });
  });

  it("ignores checkInDate — a backdated/forward-dated civil date can't spoof fulfilment", () => {
    expect(
      progressPhotosFulfillment(REQ, [
        photo({ createdAt: "2026-06-01T00:00:00.000Z", checkInDate: "2026-12-31" }),
      ]),
    ).toEqual(NOT);
  });

  it("not fulfilled with no photos or only unparseable timestamps", () => {
    expect(progressPhotosFulfillment(REQ, [])).toEqual(NOT);
    expect(progressPhotosFulfillment(REQ, [photo({ createdAt: "garbage", takenAt: null })])).toEqual(NOT);
  });

  it.each([
    ["Date", new Date(REQ)],
    ["Timestamp-like", FakeTimestamp.fromDate(new Date(REQ))],
    ["ISO string", REQ],
    ["epoch ms", Date.parse(REQ)],
  ])("accepts a %s request time", (_label, requestedAt) => {
    expect(
      progressPhotosFulfillment(requestedAt, [photo({ createdAt: "2026-06-10T12:00:00.001Z" })]),
    ).toEqual({ fulfilled: true, fulfilledAt: "2026-06-10T12:00:00.001Z" });
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["unparseable string", "yesterday"],
    ["epoch 0 (falsy)", 0],
    ["object", { when: REQ }],
  ])("no usable request time (%s) → not fulfilled", (_label, requestedAt) => {
    expect(
      progressPhotosFulfillment(requestedAt, [photo({ createdAt: "2030-01-01T00:00:00.000Z" })]),
    ).toEqual(NOT);
  });
});

describe("bodyWeightFulfillment (one bounded read)", () => {
  it("fulfilled when the latest weigh-in is after the request; reads only this client, limit 1", async () => {
    const db = mockDb.current!;
    db.seed("users/c1/body_weight_logs/a", { recordedAt: FakeTimestamp.fromDate(new Date("2026-06-09T00:00:00Z")) });
    db.seed("users/c1/body_weight_logs/b", { recordedAt: FakeTimestamp.fromDate(new Date("2026-06-11T08:30:00Z")) });
    db.seed("users/c2/body_weight_logs/x", { recordedAt: FakeTimestamp.fromDate(new Date("2026-06-20T00:00:00Z")) });

    await expect(bodyWeightFulfillment("c1", REQ)).resolves.toEqual({
      fulfilled: true,
      fulfilledAt: "2026-06-11T08:30:00.000Z",
    });
    expect(db.queries).toEqual([
      {
        collection: "users/c1/body_weight_logs",
        filters: [],
        orderBy: [{ field: "recordedAt", dir: "desc" }],
        limit: 1,
      },
    ]);
    expect(db.writes).toEqual([]);
  });

  it("not fulfilled when the latest weigh-in is at/before the request", async () => {
    mockDb.current!.seed("users/c1/body_weight_logs/a", { recordedAt: FakeTimestamp.fromDate(new Date(REQ)) });
    await expect(bodyWeightFulfillment("c1", REQ)).resolves.toEqual(NOT);
  });

  it("not fulfilled with no logs, or a latest log without a usable recordedAt", async () => {
    await expect(bodyWeightFulfillment("c1", REQ)).resolves.toEqual(NOT);
    mockDb.current!.seed("users/c1/body_weight_logs/a", { recordedAt: "nope" });
    await expect(bodyWeightFulfillment("c1", REQ)).resolves.toEqual(NOT);
  });

  it("does not read at all when there is no request", async () => {
    await expect(bodyWeightFulfillment("c1", null)).resolves.toEqual(NOT);
    expect(mockDb.current!.queries).toEqual([]);
  });

  it("fails soft on a read error", async () => {
    mockDb.current!.failQueryWhen(() => true);
    await expect(bodyWeightFulfillment("c1", REQ)).resolves.toEqual(NOT);
  });
});
