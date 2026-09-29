export {};

type MockData = Record<string, unknown>;
type MockDocumentReference = {
  id: string;
  collectionName: string;
  get: () => Promise<ReturnType<typeof snapshot>>;
  set: (data: MockData, options?: { merge?: boolean }) => Promise<void>;
};

const collections = new Map<string, Map<string, MockData>>();
const mockCascadeTwoPQCaseStatusToSamplingChildren = jest.fn();
const mockSynchronizeTwoPQCasesFilesAndCodes = jest.fn();

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

function documentReference(
  collectionName: string,
  id: string,
): MockDocumentReference {
  return {
    id,
    collectionName,
    get: async () => snapshot(collectionName, id),
    set: async (data, options) => {
      const existing = collectionStore(collectionName).get(id) ?? {};
      collectionStore(collectionName).set(
        id,
        options?.merge ? { ...existing, ...data } : { ...data },
      );
    },
  };
}

function collectionReference(name: string) {
  return {
    doc: (id: string) => documentReference(name, id),
    where: (field: string, _operator: string, value: unknown) => ({
      get: async () => ({
        docs: [...collectionStore(name).entries()]
          .filter(([, data]) => data[field] === value)
          .map(([id]) => snapshot(name, id)),
      }),
    }),
    get: async () => ({
      docs: [...collectionStore(name).keys()].map((id) => snapshot(name, id)),
    }),
  };
}

const mockDb = {
  collection: (name: string) => collectionReference(name),
  runTransaction: async (
    callback: (transaction: {
      get: (reference: MockDocumentReference) => Promise<ReturnType<typeof snapshot>>;
      set: (
        reference: MockDocumentReference,
        data: MockData,
        options?: { merge?: boolean },
      ) => void;
    }) => Promise<unknown>,
  ) =>
    callback({
      get: (reference) => reference.get(),
      set: (reference, data, options) => {
        void reference.set(data, options);
      },
    }),
};

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    arrayRemove: (value: unknown) => ({ operation: "arrayRemove", value }),
    arrayUnion: (value: unknown) => ({ operation: "arrayUnion", value }),
    delete: () => ({ operation: "delete" }),
  },
}));

jest.mock("../config/firebase.js", () => ({
  adminDbFor: jest.fn(() => mockDb),
}));

jest.mock("../repositories/two-pq-auto-sync.repository.js", () => ({
  synchronizeTwoPQCasesFilesAndCodes:
    mockSynchronizeTwoPQCasesFilesAndCodes,
}));

jest.mock("../repositories/two-pq-sampling-status.repository.js", () => ({
  cascadeTwoPQCaseStatusToSamplingChildren:
    mockCascadeTwoPQCaseStatusToSamplingChildren,
}));

describe("2PQ case status update orchestration", () => {
  beforeEach(() => {
    collections.clear();
    jest.clearAllMocks();
    mockCascadeTwoPQCaseStatusToSamplingChildren.mockResolvedValue({
      caseId: "CASE-00001",
      caseStatus: "lab_processing",
      processingStatus: "processing",
      changed: true,
      updatedSamplingIds: ["SAMP-00001"],
      unchangedSamplingIds: [],
    });
    mockSynchronizeTwoPQCasesFilesAndCodes.mockResolvedValue([]);

    collectionStore("institutions").set("INST-00001", {
      code: "INST",
      name: "Institution",
    });
    collectionStore("doctors").set("DOC-00001", {
      institutionId: "INST-00001",
      authEmail: "doctor@example.com",
      fullName: "Doctor",
      status: "active",
    });
    collectionStore("2pq_case").set("CASE-00001", {
      areaKey: "cases",
      collectionKey: "2pq_case",
      institutionId: "INST-00001",
      doctorId: "DOC-00001",
      caseLabel: "ABCXXX",
      caseStatus: "samples_received",
      children_sampling: ["SAMP-00001"],
      createdAt: "2026-09-28T10:00:00.000Z",
      updatedAt: "2026-09-28T11:00:00.000Z",
    });
    collectionStore("2pq_sampling").set("SAMP-00001", {
      areaKey: "sampling",
      collectionKey: "2pq_sampling",
      institutionId: "INST-00001",
      doctorId: "DOC-00001",
      parent_case: "CASE-00001",
      processingStatus: "received",
      createdAt: "2026-09-28T10:00:00.000Z",
      updatedAt: "2026-09-28T11:00:00.000Z",
    });
  });

  it("cascades sampling statuses before creating the file-storage snapshot", async () => {
    const { updateTwoPQRecordForContext } = await import(
      "../repositories/two-pq.repository.js"
    );

    await updateTwoPQRecordForContext(
      {
        email: "admin@example.com",
        uid: "admin-1",
        role: "full_admin",
        isBootstrap: false,
        canAccessBackoffice: true,
        canAccessPatientPortal: false,
        canAccessPGFlex: false,
        projectAccess: ["mydnamap"],
      },
      "cases",
      "CASE-00001",
      { caseStatus: "lab_processing" },
    );

    expect(
      mockCascadeTwoPQCaseStatusToSamplingChildren,
    ).toHaveBeenCalledWith({
      caseId: "CASE-00001",
      previousCaseStatus: "samples_received",
      nextCaseStatus: "lab_processing",
      actorEmail: "admin@example.com",
    });
    expect(mockSynchronizeTwoPQCasesFilesAndCodes).toHaveBeenCalledWith(
      ["CASE-00001"],
      "admin@example.com",
    );
    expect(
      mockCascadeTwoPQCaseStatusToSamplingChildren.mock.invocationCallOrder[0]!,
    ).toBeLessThan(
      mockSynchronizeTwoPQCasesFilesAndCodes.mock.invocationCallOrder[0]!,
    );
  });
});
