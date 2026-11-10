export {};

type Data = Record<string, unknown>;
const mockDocuments = new Map<string, Data>();
let mockTransactionQueue = Promise.resolve();

function reference(collection: string, id: string) {
  return { path: `${collection}/${id}`, id };
}

function documentSnapshot(ref: ReturnType<typeof reference>) {
  const data = mockDocuments.get(ref.path);
  return { exists: Boolean(data), id: ref.id, data: () => data };
}

function query(collection: string, field: string, values: string[]) {
  return {
    limit: (count: number) => ({
      get: async () => {
        const docs = [...mockDocuments.entries()]
          .filter(([path, data]) => {
            const value = field.split(".").reduce<unknown>((node, key) =>
              node && typeof node === "object" ? (node as Data)[key] : undefined, data);
            return path.startsWith(`${collection}/`) && values.includes(String(value));
          })
          .slice(0, count)
          .map(([path]) => documentSnapshot(reference(collection, path.split("/")[1]!)));
        return { docs, empty: docs.length === 0 };
      },
    }),
  };
}

jest.mock("../config/firebase.js", () => ({
  adminDbFor: () => ({
    collection: (name: string) => ({
      doc: (id: string) => reference(name, id),
      where: (field: string, _operator: string, values: string[]) => query(name, field, values),
    }),
    // Serializes transactions as Firestore does when they contend on one reservation.
    runTransaction: (callback: (transaction: unknown) => Promise<void>) => {
      const result = mockTransactionQueue.then(async () => {
        const writes: Array<[string, Data]> = [];
        await callback({
          get: async (target: { path?: string; get?: () => Promise<unknown> }) =>
            target.get ? target.get() : documentSnapshot(target as ReturnType<typeof reference>),
          create: (target: ReturnType<typeof reference>, data: Data) => writes.push([target.path, data]),
          set: (target: ReturnType<typeof reference>, data: Data) => writes.push([target.path, data]),
        });
        writes.forEach(([path, data]) => mockDocuments.set(path, data));
      });
      mockTransactionQueue = result.catch(() => {});
      return result;
    },
  }),
}));

async function reserveTwoPQCaseCode(value: string | undefined, caseId: string, actorEmail: string) {
  const { adminDbFor } = await import("../config/firebase.js");
  const { prepareTwoPQCaseCodeReservation } = await import("../repositories/two-pq-code-registry.repository.js");
  return adminDbFor("mydnamap").runTransaction(async (transaction) => {
    const reserve = await prepareTwoPQCaseCodeReservation(transaction, value, caseId, actorEmail);
    reserve?.();
  });
}

describe("permanent 2PQ case code reservations", () => {
  beforeEach(() => {
    mockDocuments.clear();
    mockTransactionQueue = Promise.resolve();
  });

  it("allows exactly one concurrent claimant and normalizes code and email", async () => {
    const results = await Promise.allSettled([
      reserveTwoPQCaseCode(" abc ", "CASE-1", " ADMIN@EXAMPLE.COM "),
      reserveTwoPQCaseCode("ABC", "CASE-2", "other@example.com"),
    ]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    expect(mockDocuments.get("2pq_case_code_reservations/ABC")).toMatchObject({
      code: "ABC", caseId: "CASE-1", reservedByEmail: "admin@example.com",
    });
  });

  it("reuses a reservation for the same case, but never for another case after deletion", async () => {
    await reserveTwoPQCaseCode("ABC", "CASE-1", "admin@example.com");
    await reserveTwoPQCaseCode("ABC", "CASE-1", "admin@example.com");
    mockDocuments.delete("2pq_case/CASE-1");
    await expect(reserveTwoPQCaseCode("ABC", "CASE-2", "admin@example.com"))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it("protects mixed-case legacy assignments and lets their existing case claim them", async () => {
    mockDocuments.set("2pq_case/CASE-OLD", { three_letter_code: "aBc" });
    await expect(reserveTwoPQCaseCode("ABC", "CASE-NEW", "admin@example.com"))
      .rejects.toMatchObject({ statusCode: 409 });
    await expect(reserveTwoPQCaseCode("ABC", "CASE-OLD", "admin@example.com"))
      .resolves.toBeUndefined();
  });

  it.each([
    ["2pq_case/CASE-OLD", { caseLabel: "aBcxXx" }],
    ["2pq_case/CASE-OLD", { caseLabel: "Abc" }],
    ["2pq_forms/FORM-OLD", { sampleInformation: { boxCode: "ABC" }, archivedAt: "2026-01-01" }],
    ["report_codes/ABCXXX", { owner_id: "OWNER-1" }],
  ])("protects surviving historical evidence in %s", async (path, data) => {
    mockDocuments.set(path, data);
    await expect(reserveTwoPQCaseCode("ABC", "CASE-NEW", "admin@example.com"))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it("retains an old code before edits/deletion without replacing its original reservation", async () => {
    const { retainTwoPQCaseCode } = await import("../repositories/two-pq-code-registry.repository.js");
    await retainTwoPQCaseCode("ABC", "CASE-OLD", "admin@example.com");
    await retainTwoPQCaseCode("ABC", "CASE-OTHER", "admin@example.com");
    expect(mockDocuments.get("2pq_case_code_reservations/ABC")?.caseId).toBe("CASE-OLD");
    await expect(reserveTwoPQCaseCode("ABC", "CASE-NEW", "admin@example.com"))
      .rejects.toMatchObject({ statusCode: 409 });
    await expect(reserveTwoPQCaseCode("DEF", "CASE-OLD", "admin@example.com"))
      .resolves.toBeUndefined();
  });

  it("ignores absent codes and rejects invalid values without a write", async () => {
    await reserveTwoPQCaseCode(undefined, "CASE-1", "admin@example.com");
    await expect(reserveTwoPQCaseCode("AB1", "CASE-1", "admin@example.com"))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(mockDocuments.size).toBe(0);
  });
});
