export {};

type MockData = Record<string, unknown>;

const collections = new Map<string, Map<string, MockData>>();
const writeStarts: string[] = [];
let activeWrites = 0;
let maximumActiveWrites = 0;

function collectionStore(name: string) {
  let store = collections.get(name);
  if (!store) {
    store = new Map<string, MockData>();
    collections.set(name, store);
  }
  return store;
}

function snapshot(collectionName: string, id: string) {
  const data = collectionStore(collectionName).get(id);
  return {
    id,
    exists: Boolean(data),
    data: () => data,
  };
}

function collectionReference(name: string) {
  return {
    doc: (id: string) => ({
      id,
      get: async () => snapshot(name, id),
      set: async (data: MockData, options?: { merge?: boolean }) => {
        writeStarts.push(id);
        activeWrites += 1;
        maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites);
        await new Promise((resolve) => setTimeout(resolve, 2));
        const existing = collectionStore(name).get(id) ?? {};
        collectionStore(name).set(
          id,
          options?.merge ? { ...existing, ...data } : { ...data },
        );
        activeWrites -= 1;
      },
    }),
    where: (field: string, _operator: string, value: unknown) => ({
      get: async () => ({
        docs: [...collectionStore(name).entries()]
          .filter(([, data]) => data[field] === value)
          .map(([id]) => snapshot(name, id)),
      }),
    }),
  };
}

jest.mock("../config/firebase.js", () => ({
  adminDbFor: jest.fn(() => ({
    collection: (name: string) => collectionReference(name),
  })),
}));

describe("2PQ case status sampling cascade", () => {
  beforeEach(() => {
    collections.clear();
    writeStarts.length = 0;
    activeWrites = 0;
    maximumActiveWrites = 0;
  });

  it.each([
    ["intake", "awaiting_reception"],
    ["awaiting_pick_up", "awaiting_reception"],
    ["in_transit", "awaiting_reception"],
    ["samples_received", "received"],
    ["lab_processing", "processing"],
    ["bioinformatics", "ready_for_sequencing"],
    ["report_ready", "ready_for_sequencing"],
    ["delivered", "ready_for_sequencing"],
  ])("maps case status %s to sampling status %s", async (caseStatus, expected) => {
    const { samplingProcessingStatusForCaseStatus } = await import(
      "../repositories/two-pq-sampling-status.repository.js"
    );
    expect(samplingProcessingStatusForCaseStatus(caseStatus)).toBe(expected);
  });

  it("updates actual sampling children one by one before returning", async () => {
    collectionStore("2pq_case").set("CASE-00001", {
      children_sampling: ["sampling-b", "sampling-a", "sampling-stale"],
    });
    collectionStore("2pq_sampling").set("sampling-a", {
      sampleId: "AAA001",
      parent_case: "CASE-00001",
      processingStatus: "awaiting_reception",
    });
    collectionStore("2pq_sampling").set("sampling-b", {
      sampleId: "BBB001",
      parent_case: "CASE-00001",
      processingStatus: "processing",
    });
    collectionStore("2pq_sampling").set("sampling-c", {
      sampleId: "CCC001",
      parent_case: "CASE-00001",
      processingStatus: "received",
    });
    collectionStore("2pq_sampling").set("sampling-stale", {
      sampleId: "DDD001",
      parent_case: "CASE-00099",
      processingStatus: "processing",
    });

    const { cascadeTwoPQCaseStatusToSamplingChildren } = await import(
      "../repositories/two-pq-sampling-status.repository.js"
    );
    const result = await cascadeTwoPQCaseStatusToSamplingChildren({
      caseId: "CASE-00001",
      previousCaseStatus: "in_transit",
      nextCaseStatus: "samples_received",
      actorEmail: " ADMIN@EXAMPLE.COM ",
    });

    expect(result).toEqual({
      caseId: "CASE-00001",
      caseStatus: "samples_received",
      processingStatus: "received",
      changed: true,
      updatedSamplingIds: ["sampling-a", "sampling-b"],
      unchangedSamplingIds: ["sampling-c"],
    });
    expect(writeStarts).toEqual(["sampling-a", "sampling-b"]);
    expect(maximumActiveWrites).toBe(1);
    expect(collectionStore("2pq_sampling").get("sampling-a")).toMatchObject({
      processingStatus: "received",
      updatedByEmail: "admin@example.com",
      updatedAt: expect.any(String),
    });
    expect(
      collectionStore("2pq_sampling").get("sampling-stale")?.processingStatus,
    ).toBe("processing");
  });

  it("does not load or update children when the normalized case status did not change", async () => {
    const { cascadeTwoPQCaseStatusToSamplingChildren } = await import(
      "../repositories/two-pq-sampling-status.repository.js"
    );
    const result = await cascadeTwoPQCaseStatusToSamplingChildren({
      caseId: "CASE-00001",
      previousCaseStatus: "active",
      nextCaseStatus: "in_transit",
      actorEmail: "admin@example.com",
    });

    expect(result.changed).toBe(false);
    expect(writeStarts).toEqual([]);
  });
});
