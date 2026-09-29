export {};

type MockData = Record<string, unknown>;

const collections = new Map<string, Map<string, MockData>>();
const mockCreateStoredFileDocument = jest.fn();
const mockCreateIdempotentStoredFileDocument = jest.fn();
const mockUpdateStoredFileDocument = jest.fn();
const mockPublishStoredFileAsReportCode = jest.fn();
const mockCompleteTwoPQCaseServiceTransactionOutput = jest.fn();
const firestoreReads: Array<{
  type: "document" | "query";
  collection: string;
  id?: string;
  field?: string;
  value?: unknown;
}> = [];

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
      get: async () => {
        firestoreReads.push({ type: "document", collection: name, id });
        return snapshot(name, id);
      },
      set: async (data: MockData, options?: { merge?: boolean }) => {
        const existing = collectionStore(name).get(id) ?? {};
        collectionStore(name).set(
          id,
          options?.merge ? { ...existing, ...data } : { ...data },
        );
      },
    }),
    where: (field: string, _operator: string, value: unknown) => ({
      get: async () => {
        firestoreReads.push({
          type: "query",
          collection: name,
          field,
          value,
        });
        return {
          docs: [...collectionStore(name).entries()]
            .filter(([, data]) => data[field] === value)
            .map(([id]) => snapshot(name, id)),
        };
      },
    }),
  };
}

jest.mock("../config/firebase.js", () => ({
  adminDbFor: jest.fn(() => ({
    collection: (name: string) => collectionReference(name),
  })),
}));

jest.mock("../repositories/file-storage.repository.js", () => ({
  createIdempotentStoredFileDocument:
    mockCreateIdempotentStoredFileDocument,
  createStoredFileDocument: mockCreateStoredFileDocument,
  updateStoredFileDocument: mockUpdateStoredFileDocument,
}));

jest.mock("../repositories/reports.repository.js", () => ({
  publishStoredFileAsReportCode: mockPublishStoredFileAsReportCode,
}));

jest.mock("../repositories/support-services.repository.js", () => ({
  completeTwoPQCaseServiceTransactionOutput:
    mockCompleteTwoPQCaseServiceTransactionOutput,
}));

describe("2PQ case automatic file and code synchronization", () => {
  beforeEach(() => {
    collections.clear();
    firestoreReads.length = 0;
    jest.clearAllMocks();
    mockCreateStoredFileDocument.mockResolvedValue({
      document: { id: "created-file", data: {} },
    });
    mockCreateIdempotentStoredFileDocument.mockResolvedValue({
      document: { id: "pgo-2pq-output", data: {} },
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
    mockCompleteTwoPQCaseServiceTransactionOutput.mockResolvedValue({
      status: "completed",
      transaction: { requestId: "pgr_2pq_case_00001" },
    });
  });

  it("serializes only the current case and one compact batch without reading siblings", async () => {
    collectionStore("2pq_case").set("CASE-CURRENT", {
      institutionId: "institution-1",
      doctorId: "doctor-1",
      patientId: "patient-1",
      parent_batch: "BATCH-1",
      children_sampling: ["SAMPLING-1"],
      caseLabel: "Current case",
      caseStatus: "lab_processing",
      download_url: "https://reports.example.com/current-case.pdf",
      updatedAt: "2026-09-28T12:00:00.000Z",
    });
    collectionStore("institutions").set("institution-1", {
      name: "Clinica de Fertilidad",
    });
    collectionStore("doctors").set("doctor-1", {
      fullName: "Dra. Ada Lovelace",
    });
    collectionStore("patients").set("patient-1", {
      fullName: "Grace Hopper",
    });
    collectionStore("2pq_case").set("CASE-SIBLING", {
      parent_batch: "BATCH-1",
      caseLabel: "Sibling that must not be read",
    });
    collectionStore("2pq_sequencing").set("BATCH-1", {
      institutionId: "institution-1",
      caseLabel: "September run",
      runId: "RUN-2026-09",
      analysisStatus: "processing",
      platform: "NovaSeq",
      scheduling: "2026-09-28",
      providerName: "2PQ",
      updatedAt: "2026-09-28T11:30:00.000Z",
      children_cases: ["CASE-CURRENT", "CASE-SIBLING"],
      linkedCaseIds: ["CASE-SIBLING"],
      largeArbitraryMap: { sibling: { deeply: { nested: true } } },
    });
    collectionStore("2pq_sampling").set("SAMPLING-1", {
      parent_case: "CASE-CURRENT",
      sampleId: "SAMPLE-1",
      processingStatus: "processing",
    });

    const { buildTwoPQCaseFileStorageSnapshot } = await import(
      "../repositories/two-pq-auto-sync.repository.js"
    );
    const { identifyPgiNativeModel } = await import(
      "../lib/pgi-native-schema.js"
    );
    const result = await buildTwoPQCaseFileStorageSnapshot("CASE-CURRENT");

    expect(result?.main_case).toEqual({
      id: "CASE-CURRENT",
      download_url: "https://reports.example.com/current-case.pdf",
      parent_batch_id: "BATCH-1",
      children_sampling_ids: ["SAMPLING-1"],
      last_updated: "2026-09-28T12:00:00.000Z",
    });
    expect(result?.entities.cases).toHaveLength(1);
    expect(result?.entities.cases[0]).toMatchObject({
      id: "CASE-CURRENT",
      download_url: "https://reports.example.com/current-case.pdf",
      scope: {
        institutionId: "institution-1",
        institutionName: "Clinica de Fertilidad",
        doctorId: "doctor-1",
        doctorName: "Dra. Ada Lovelace",
        patientId: "patient-1",
        patientName: "Grace Hopper",
      },
      relations: {
        batchId: "BATCH-1",
        samplingIds: ["SAMPLING-1"],
      },
    });
    expect(result?.entities.batches).toEqual([
      {
        id: "BATCH-1",
        kind: "batch",
        batchLabel: "September run",
        runId: "RUN-2026-09",
        institutionId: "institution-1",
        analysisStatus: "processing",
        platform: "NovaSeq",
        scheduling: "2026-09-28",
        providerName: "2PQ",
        updatedAt: "2026-09-28T11:30:00.000Z",
      },
    ]);
    expect(result?.entities.samplings).toHaveLength(1);
    expect(result?.entities.samplings[0]).toMatchObject({
      scope: {
        institutionName: "Clinica de Fertilidad",
        doctorName: "Dra. Ada Lovelace",
        patientName: "Grace Hopper",
      },
    });
    expect(identifyPgiNativeModel(result)).toEqual({
      ok: true,
      model: "2pq",
    });
    expect(
      firestoreReads.filter((read) => read.collection === "2pq_case"),
    ).toEqual([
      { type: "document", collection: "2pq_case", id: "CASE-CURRENT" },
    ]);
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
    const reportProgress = jest.fn().mockResolvedValue(undefined);
    const result = await synchronizeTwoPQCaseFilesAndCodes(
      "CASE-00001",
      "admin@example.com",
      reportProgress,
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
        download_url: null,
        parent_batch_id: null,
      },
      entities: {
        batches: [],
        cases: [
          expect.objectContaining({
            id: "CASE-00001",
            download_url: null,
            scope: expect.objectContaining({
              institutionName: null,
              doctorName: null,
              patientName: null,
            }),
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
    expect(
      reportProgress.mock.calls.map(([event]) => ({
        step: event.step,
        status: event.status,
      })),
    ).toEqual([
      { step: "file_storage", status: "running" },
      { step: "file_storage", status: "success" },
      { step: "report_code", status: "running" },
      { step: "report_code", status: "success" },
    ]);
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
    const reportProgress = jest.fn().mockResolvedValue(undefined);
    await expect(
      synchronizeTwoPQCaseFilesAndCodes(
        "CASE-00003",
        "admin@example.com",
        reportProgress,
      ),
    ).resolves.toEqual({
      status: "skipped",
      caseId: "CASE-00003",
      reason: "disabled",
    });
    expect(mockCreateStoredFileDocument).not.toHaveBeenCalled();
    expect(mockUpdateStoredFileDocument).not.toHaveBeenCalled();
    expect(mockPublishStoredFileAsReportCode).not.toHaveBeenCalled();
    expect(mockCreateIdempotentStoredFileDocument).not.toHaveBeenCalled();
    expect(
      mockCompleteTwoPQCaseServiceTransactionOutput,
    ).not.toHaveBeenCalled();
    expect(
      reportProgress.mock.calls.map(([event]) => ({
        step: event.step,
        status: event.status,
      })),
    ).toEqual([
      { step: "file_storage", status: "skipped" },
      { step: "report_code", status: "skipped" },
    ]);
  });

  it("creates and delivers the final PDF object after publishing the case report code", async () => {
    const reportOwnerId = "c3x313CE2oZwIXVRxDHBQR31RlR2";
    collectionStore("2pq_case").set("CASE-00022", {
      institutionId: "institution-1",
      doctorId: "doctor-1",
      three_letter_code: "abc",
      stored_file_id: "existing-file",
      caseLabel: "ABCXXX",
      caseStatus: "report_ready",
      download_url: "https://reports.example.com/ABCXXX.pdf",
      createdAt: "2026-09-28T10:00:00.000Z",
      updatedAt: "2026-09-28T11:00:00.000Z",
    });
    collectionStore("doctors").set("doctor-1", {
      authEmail: "Doctor@Clinic.Example",
    });
    collectionStore("report_codes").set("ABCXXX", {
      owner_id: reportOwnerId,
      uploaded_report_id: "uploaded-report-abc",
    });
    collectionStore("uploaded_reports").set("uploaded-report-abc", {
      report_owner_id: reportOwnerId,
    });
    collectionStore("report_owners").set(reportOwnerId, {
      owner_contact_email: "info@2pq.life",
    });
    mockCompleteTwoPQCaseServiceTransactionOutput.mockResolvedValueOnce({
      status: "completed",
      transaction: { requestId: "pgr_2pq_case_00022" },
    });

    const { synchronizeTwoPQCaseFilesAndCodes } = await import(
      "../repositories/two-pq-auto-sync.repository.js"
    );
    await synchronizeTwoPQCaseFilesAndCodes("CASE-00022", "open-api");

    expect(mockCreateIdempotentStoredFileDocument).toHaveBeenCalledWith(
      "pgo_2pq_case_00022_pdf_report",
      {
        file_name: "Informe PGT ABCXXX",
        creator_email: "info@2pq.life",
        file_type: "pgo_pdf_report",
        file_content: JSON.stringify({
          title: "Informe PGT ABCXXX",
          download_url: "https://reports.example.com/ABCXXX.pdf",
        }),
      },
    );
    expect(mockCompleteTwoPQCaseServiceTransactionOutput).toHaveBeenCalledWith({
      caseId: "CASE-00022",
      doctorEmail: "doctor@clinic.example",
      fileStorageId: "pgo_2pq_case_00022_pdf_report",
      reportOwnerId,
      actorEmail: "open-api",
    });
    expect(
      mockPublishStoredFileAsReportCode.mock.invocationCallOrder[0]!,
    ).toBeLessThan(
      mockCreateIdempotentStoredFileDocument.mock.invocationCallOrder[0]!,
    );
    expect(
      mockCreateIdempotentStoredFileDocument.mock.invocationCallOrder[0]!,
    ).toBeLessThan(
      mockCompleteTwoPQCaseServiceTransactionOutput.mock.invocationCallOrder[0]!,
    );
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
