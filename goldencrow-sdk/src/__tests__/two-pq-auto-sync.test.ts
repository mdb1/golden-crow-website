export {};

type MockData = Record<string, unknown>;

const collections = new Map<string, Map<string, MockData>>();
const mockCreateStoredFileDocument = jest.fn();
const mockUpdateStoredFileDocument = jest.fn();
const mockPublishStoredFileAsReportCode = jest.fn();

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
        const existing = collectionStore(name).get(id) ?? {};
        collectionStore(name).set(
          id,
          options?.merge ? { ...existing, ...data } : { ...data },
        );
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

jest.mock("../repositories/file-storage.repository.js", () => ({
  createStoredFileDocument: mockCreateStoredFileDocument,
  updateStoredFileDocument: mockUpdateStoredFileDocument,
}));

jest.mock("../repositories/reports.repository.js", () => ({
  publishStoredFileAsReportCode: mockPublishStoredFileAsReportCode,
}));

describe("2PQ case automatic file and code synchronization", () => {
  beforeEach(() => {
    collections.clear();
    jest.clearAllMocks();
    mockCreateStoredFileDocument.mockResolvedValue({
      document: { id: "created-file", data: {} },
    });
    mockUpdateStoredFileDocument.mockResolvedValue({
      document: { id: "existing-file", data: {} },
      linkedReportVersionBumped: true,
    });
    mockPublishStoredFileAsReportCode.mockResolvedValue({
      reportCode: "ABCXXX",
      uploadedReportId: "uploaded-1",
      fileId: "existing-file",
      created: false,
      ownerId: "owner-1",
      ownerEmail: "owner@example.com",
      preservedExistingOwner: true,
    });
  });

  it("treats a missing preference as enabled and updates file storage before the report code", async () => {
    collectionStore("2pq_case").set("CASE-00001", {
      institutionId: "institution-1",
      doctorId: "doctor-1",
      three_letter_code: "abc",
      stored_file_id: "existing-file",
      caseLabel: "ABCXXX",
      caseStatus: "active",
      createdAt: "2026-09-28T10:00:00.000Z",
      updatedAt: "2026-09-28T11:00:00.000Z",
    });

    const { synchronizeTwoPQCaseFilesAndCodes } = await import(
      "../repositories/two-pq-auto-sync.repository.js"
    );
    const result = await synchronizeTwoPQCaseFilesAndCodes(
      "CASE-00001",
      "admin@example.com",
    );

    expect(result).toMatchObject({
      status: "synchronized",
      storedFileId: "existing-file",
      reportCode: "ABCXXX",
      createdStoredFile: false,
    });
    expect(mockUpdateStoredFileDocument).toHaveBeenCalledWith(
      "existing-file",
      expect.objectContaining({
        file_name: "ABCXXX",
        file_type: "2pq",
      }),
    );
    const fileContent = mockUpdateStoredFileDocument.mock.calls[0]?.[1]
      ?.file_content as string;
    expect(JSON.parse(fileContent)).toMatchObject({
      main_case: {
        id: "CASE-00001",
        parent_batch_id: null,
      },
      entities: {
        cases: [
          expect.objectContaining({
            id: "CASE-00001",
            status: expect.objectContaining({ caseStatus: "in_transit" }),
          }),
        ],
      },
    });
    expect(
      mockUpdateStoredFileDocument.mock.invocationCallOrder[0],
    ).toBeLessThan(mockPublishStoredFileAsReportCode.mock.invocationCallOrder[0]!);
    expect(mockPublishStoredFileAsReportCode).toHaveBeenCalledWith({
      fileId: "existing-file",
      reportCode: "ABCXXX",
    });
  });

  it("creates and links a missing stored file before publishing the report code", async () => {
    collectionStore("2pq_case").set("CASE-00002", {
      institutionId: "institution-1",
      doctorId: "doctor-1",
      three_letter_code: "def",
      should_automatically_sync_files_and_codes: true,
      createdAt: "2026-09-28T10:00:00.000Z",
      updatedAt: "2026-09-28T11:00:00.000Z",
    });
    mockPublishStoredFileAsReportCode.mockResolvedValueOnce({
      reportCode: "DEFXXX",
      uploadedReportId: "uploaded-2",
      fileId: "created-file",
      created: true,
      ownerId: "owner-2pq",
      ownerEmail: "info@2pq.life",
      preservedExistingOwner: false,
    });

    const { synchronizeTwoPQCaseFilesAndCodes } = await import(
      "../repositories/two-pq-auto-sync.repository.js"
    );
    const result = await synchronizeTwoPQCaseFilesAndCodes(
      "CASE-00002",
      "open-api",
    );

    expect(result).toMatchObject({
      status: "synchronized",
      storedFileId: "created-file",
      reportCode: "DEFXXX",
      createdStoredFile: true,
    });
    expect(mockCreateStoredFileDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        file_name: "DEFXXX",
        creator_email: "info@2pq.life",
      }),
    );
    expect(
      collectionStore("2pq_case").get("CASE-00002")?.stored_file_id,
    ).toBe("created-file");
    expect(
      mockCreateStoredFileDocument.mock.invocationCallOrder[0],
    ).toBeLessThan(mockPublishStoredFileAsReportCode.mock.invocationCallOrder[0]!);
  });

  it("does not touch files or report codes when automatic synchronization is disabled", async () => {
    collectionStore("2pq_case").set("CASE-00003", {
      three_letter_code: "ghi",
      should_automatically_sync_files_and_codes: false,
    });

    const { synchronizeTwoPQCaseFilesAndCodes } = await import(
      "../repositories/two-pq-auto-sync.repository.js"
    );
    await expect(
      synchronizeTwoPQCaseFilesAndCodes("CASE-00003", "admin@example.com"),
    ).resolves.toEqual({
      status: "skipped",
      caseId: "CASE-00003",
      reason: "disabled",
    });
    expect(mockCreateStoredFileDocument).not.toHaveBeenCalled();
    expect(mockUpdateStoredFileDocument).not.toHaveBeenCalled();
    expect(mockPublishStoredFileAsReportCode).not.toHaveBeenCalled();
  });

  it("repairs a stale case link from the file already owned by its report code", async () => {
    collectionStore("2pq_case").set("CASE-00004", {
      institutionId: "institution-1",
      doctorId: "doctor-1",
      three_letter_code: "jkl",
      stored_file_id: "missing-file",
      updatedAt: "2026-09-28T11:00:00.000Z",
    });
    collectionStore("report_codes").set("JKLXXX", {
      uploaded_report_id: "uploaded-4",
    });
    collectionStore("uploaded_reports").set("uploaded-4", {
      linked_file_id: "recovered-file",
    });
    collectionStore("file_storage").set("recovered-file", {
      file_name: "JKLXXX",
    });
    mockUpdateStoredFileDocument.mockResolvedValueOnce({
      document: { id: "recovered-file", data: {} },
      linkedReportVersionBumped: true,
    });

    const { synchronizeTwoPQCaseFilesAndCodes } = await import(
      "../repositories/two-pq-auto-sync.repository.js"
    );
    await synchronizeTwoPQCaseFilesAndCodes(
      "CASE-00004",
      "admin@example.com",
    );

    expect(mockUpdateStoredFileDocument).toHaveBeenCalledWith(
      "recovered-file",
      expect.objectContaining({ file_name: "JKLXXX" }),
    );
    expect(
      collectionStore("2pq_case").get("CASE-00004")?.stored_file_id,
    ).toBe("recovered-file");
    expect(mockPublishStoredFileAsReportCode).toHaveBeenCalledWith({
      fileId: "recovered-file",
      reportCode: "JKLXXX",
    });
  });
});
