export {};

type MockData = Record<string, unknown>;
type MockDocumentReference = {
  id: string;
  collectionName: string;
  get: () => Promise<ReturnType<typeof snapshot>>;
  set: (data: MockData, options?: { merge?: boolean }) => Promise<void>;
  delete: () => Promise<void>;
};

const collections = new Map<string, Map<string, MockData>>();
const mockCascadeTwoPQCaseStatusToSamplingChildren = jest.fn();
const mockSynchronizeTwoPQCasesFilesAndCodes = jest.fn();
const mockCreateTwoPQCaseServiceTransaction = jest.fn();

const linkedStudyRequestForm = {
  id: "FORM-00041",
  formType: "study_request" as const,
  institutionId: "INST-00001",
  doctorId: "DOC-00001",
  selectedPatientId: "PAT-00001",
  patientInformation: {
    patientId: "PAT-00001",
    institutionId: "INST-00001",
    doctorId: "DOC-00001",
  },
  medicalInformation: {},
  previousGeneticTests: {},
  requestedTest: {},
  institutionInformation: {},
  createdAt: "2026-09-28T09:00:00.000Z",
};

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
    delete: async () => {
      collectionStore(collectionName).delete(id);
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
  batch: () => {
    const operations: Array<() => Promise<void>> = [];
    return {
      set: (
        reference: MockDocumentReference,
        data: MockData,
        options?: { merge?: boolean },
      ) => {
        operations.push(() => reference.set(data, options));
      },
      delete: (reference: MockDocumentReference) => {
        operations.push(() => reference.delete());
      },
      commit: async () => {
        for (const operation of operations) {
          await operation();
        }
      },
    };
  },
  runTransaction: async (
    callback: (transaction: {
      get: (reference: MockDocumentReference) => Promise<ReturnType<typeof snapshot>>;
      set: (
        reference: MockDocumentReference,
        data: MockData,
        options?: { merge?: boolean },
      ) => void;
      delete: (reference: MockDocumentReference) => void;
    }) => Promise<unknown>,
  ) =>
    callback({
      get: (reference) => reference.get(),
      set: (reference, data, options) => {
        void reference.set(data, options);
      },
      delete: (reference) => {
        void reference.delete();
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

jest.mock("../repositories/support-services.repository.js", () => ({
  createTwoPQCaseServiceTransaction:
    mockCreateTwoPQCaseServiceTransaction,
}));

describe("2PQ case status update orchestration", () => {
  beforeEach(() => {
    collections.clear();
    jest.clearAllMocks();
    mockCreateTwoPQCaseServiceTransaction.mockResolvedValue({
      id: "pgr_2pq_case_00002",
    });
    mockCascadeTwoPQCaseStatusToSamplingChildren.mockResolvedValue({
      caseId: "CASE-00001",
      caseStatus: "lab_processing",
      processingStatus: "processing",
      changed: true,
      updatedSamplingIds: ["SAMP-00001"],
      unchangedSamplingIds: [],
    });
    mockSynchronizeTwoPQCasesFilesAndCodes.mockImplementation(
      async (_caseIds, _actorEmail, reportProgress) => {
        await reportProgress?.({
          step: "file_storage",
          status: "running",
        });
        await reportProgress?.({
          step: "file_storage",
          status: "success",
        });
        await reportProgress?.({
          step: "report_code",
          status: "running",
        });
        await reportProgress?.({
          step: "report_code",
          status: "success",
        });
        return [];
      },
    );

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
    collectionStore("patients").set("PAT-00001", {
      institutionId: "INST-00001",
      doctorId: "DOC-00001",
      email: "patient@example.com",
      fullName: "Patient",
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

    const progressEvents: Array<Record<string, unknown>> = [];
    const reportCaseStatusProgress = jest.fn(async (event) => {
      progressEvents.push(event);
    });

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
      { reportCaseStatusProgress },
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
      reportCaseStatusProgress,
    );
    expect(progressEvents.map(({ step, status }) => ({ step, status }))).toEqual(
      [
        { step: "case", status: "success" },
        { step: "samplings", status: "running" },
        { step: "samplings", status: "success" },
        { step: "file_storage", status: "running" },
        { step: "file_storage", status: "success" },
        { step: "report_code", status: "running" },
        { step: "report_code", status: "success" },
      ],
    );
    expect(
      mockCascadeTwoPQCaseStatusToSamplingChildren.mock.invocationCallOrder[0]!,
    ).toBeLessThan(
      mockSynchronizeTwoPQCasesFilesAndCodes.mock.invocationCallOrder[0]!,
    );
    expect(collectionStore("2pq_case").get("CASE-00001")).toMatchObject({
      caseStatus: "lab_processing",
      linkedStudyRequestFormId: null,
    });
  });

  it("creates the deferred service transaction before auto-syncing a new case", async () => {
    collectionStore("admin_sequences").set("2pq_case", { current: 1 });
    const { createTwoPQRecordForContext } = await import(
      "../repositories/two-pq.repository.js"
    );
    const context = {
      email: "lab@example.com",
      uid: "lab-1",
      role: "institution_laboratory_staff" as const,
      isBootstrap: false,
      canAccessBackoffice: true,
      canAccessPatientPortal: false,
      canAccessPGFlex: false,
      projectAccess: ["mydnamap" as const],
      institutionId: "INST-00001",
    };

    const created = await createTwoPQRecordForContext(
      context,
      "cases",
      {
        institutionId: "INST-00001",
        doctorId: "DOC-00001",
        patientId: "PAT-00001",
        caseLabel: "ABCXXX",
        caseStatus: "intake",
      },
      { studyRequestForm: linkedStudyRequestForm },
    );

    expect(created.id).toBe("CASE-00002");
    expect(mockCreateTwoPQCaseServiceTransaction).toHaveBeenCalledWith(
      context,
      {
        caseId: "CASE-00002",
        threeLetterCode: "ABC",
        doctorEmail: "doctor@example.com",
        requestedAtClient: expect.any(String),
        studyRequestForm: linkedStudyRequestForm,
      },
    );
    expect(
      mockCreateTwoPQCaseServiceTransaction.mock.invocationCallOrder[0]!,
    ).toBeLessThan(
      mockSynchronizeTwoPQCasesFilesAndCodes.mock.invocationCallOrder[0]!,
    );
    expect(collectionStore("2pq_case").get("CASE-00002")).toMatchObject({
      doctorId: "DOC-00001",
      institutionId: "INST-00001",
      patientId: "PAT-00001",
      linkedStudyRequestFormId: "FORM-00041",
      should_automatically_sync_files_and_codes: true,
    });
  });

  it("rejects direct case creation without a linked study request", async () => {
    const { createTwoPQRecordForContext } = await import(
      "../repositories/two-pq.repository.js"
    );

    await expect(
      createTwoPQRecordForContext(
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
        {
          institutionId: "INST-00001",
          doctorId: "DOC-00001",
          patientId: "PAT-00001",
          caseLabel: "ABCXXX",
          caseStatus: "intake",
        },
      ),
    ).rejects.toThrow(
      "A 2PQ case can only be created from a linked study request form.",
    );
    expect(collectionStore("2pq_case").has("CASE-00002")).toBe(false);
    expect(mockCreateTwoPQCaseServiceTransaction).not.toHaveBeenCalled();
  });

  it("rolls a new case back when its mandatory service transaction fails", async () => {
    collectionStore("admin_sequences").set("2pq_case", { current: 1 });
    mockCreateTwoPQCaseServiceTransaction.mockRejectedValueOnce(
      new Error("Configured 2PQ offer is unavailable"),
    );
    const { createTwoPQRecordForContext } = await import(
      "../repositories/two-pq.repository.js"
    );

    await expect(
      createTwoPQRecordForContext(
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
        {
          institutionId: "INST-00001",
          doctorId: "DOC-00001",
          patientId: "PAT-00001",
          caseLabel: "ABCXXX",
          caseStatus: "intake",
        },
        { studyRequestForm: linkedStudyRequestForm },
      ),
    ).rejects.toThrow("Configured 2PQ offer is unavailable");
    expect(collectionStore("2pq_case").has("CASE-00002")).toBe(false);
    expect(mockSynchronizeTwoPQCasesFilesAndCodes).not.toHaveBeenCalled();
  });
});
