export {};

type MockDocData = Record<string, unknown>;
type MockDocumentRef = { id: string; collectionName: string };

const mockPatients = new Map<string, MockDocData>();
const mockInstitutions = new Map<string, MockDocData>();
const mockDoctors = new Map<string, MockDocData>();
const mockTwoPQCases = new Map<string, MockDocData>();
const mockTwoPQSamplings = new Map<string, MockDocData>();
const mockTransactionGet = jest.fn();
const mockTransactionSet = jest.fn();
const mockFieldValueIncrement = jest.fn((value: number) => ({
  __op: "increment",
  value,
}));
const mockServerTimestamp = jest.fn(() => ({
  __op: "serverTimestamp",
}));

function sourceForCollection(collectionName: string) {
  if (collectionName === "patients") {
    return mockPatients;
  }
  if (collectionName === "institutions") {
    return mockInstitutions;
  }
  if (collectionName === "doctors") {
    return mockDoctors;
  }
  if (collectionName === "2pq_case") {
    return mockTwoPQCases;
  }
  if (collectionName === "2pq_sampling") {
    return mockTwoPQSamplings;
  }
  return new Map<string, MockDocData>();
}

class QueryStub {
  private field?: string;
  private value?: unknown;
  private limitValue?: number;

  constructor(private readonly collectionName: string) {}

  where(field: string, _operator: string, value: unknown) {
    this.field = field;
    this.value = value;
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  async get() {
    const source = sourceForCollection(this.collectionName);
    const docs = [...source.entries()]
      .filter(([, data]) => !this.field || data[this.field] === this.value)
      .slice(0, this.limitValue)
      .map(([id, data]) => ({
        id,
        exists: true,
        data: () => data,
      }));

    return {
      empty: docs.length === 0,
      docs,
    };
  }

  doc(id?: string): MockDocumentRef & { get: jest.Mock } {
    const documentId = id ?? "auto-report-id";
    return {
      id: documentId,
      collectionName: this.collectionName,
      get: jest.fn(async () => {
        const source = sourceForCollection(this.collectionName);
        const data = source.get(documentId);
        return {
          id: documentId,
          exists: Boolean(data),
          data: () => data,
        };
      }),
    };
  }
}

const mockRunTransaction = jest.fn(
  async (callback: (transaction: unknown) => unknown) =>
    callback({
      get: mockTransactionGet,
      set: mockTransactionSet,
    }),
);

const mockCollection = jest.fn((name: string) => new QueryStub(name));

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    increment: mockFieldValueIncrement,
    serverTimestamp: mockServerTimestamp,
  },
}));

jest.mock("../config/firebase.js", () => ({
  adminDbFor: jest.fn(() => ({
    collection: mockCollection,
    runTransaction: mockRunTransaction,
  })),
}));

describe("reporting repository", () => {
  beforeEach(() => {
    jest.resetModules();
    mockPatients.clear();
    mockInstitutions.clear();
    mockDoctors.clear();
    mockTwoPQCases.clear();
    mockTwoPQSamplings.clear();
    mockCollection.mockClear();
    mockRunTransaction.mockClear();
    mockTransactionGet.mockReset();
    mockTransactionSet.mockClear();
    mockFieldValueIncrement.mockClear();
    mockServerTimestamp.mockClear();

    mockPatients.set("PAT-00001", {
      institutionId: "INST-00001",
      doctorId: "DOC-00001",
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      medicalRecordNumber: "MRN-1",
      birthDate: "1990-01-01",
      sex: "female",
      status: "active",
      additionalInformation: {
        documentId: "12345678",
      },
    });

    mockInstitutions.set("INST-00001", {
      name: "Fertility Clinic",
      email: "ops@clinic.example",
      phoneNumber: "+5491100000000",
      status: "active",
    });

    mockDoctors.set("DOC-00001", {
      fullName: "Dr. Grace Hopper",
      email: "grace@example.com",
      phone: "+5491100000001",
      status: "active",
    });

    mockTwoPQCases.set("CASE-00001", {
      institutionId: "INST-00001",
      doctorId: "DOC-00001",
      patientId: "PAT-00001",
      parent_batch: "SEQ-00001",
      children_cases: ["CASE-OTHER"],
      children_sampling: ["SAMP-00001"],
      three_letter_code: "ABC",
      caseLabel: "ABCXXX",
      caseStatus: "processing",
      caseType: "2PQ",
      priority: "standard",
      requestedAt: "2026-08-19",
      notes: "Current case only.",
      updatedAt: "2026-08-19T12:00:00.000Z",
    });

    mockTwoPQCases.set("CASE-OTHER", {
      institutionId: "INST-00001",
      doctorId: "DOC-00001",
      patientId: "PAT-00001",
      parent_batch: "SEQ-00001",
      three_letter_code: "DEF",
      caseLabel: "DEFXXX",
    });

    mockTwoPQSamplings.set("SAMP-00001", {
      institutionId: "INST-00001",
      doctorId: "DOC-00001",
      patientId: "PAT-00001",
      parent_case: "CASE-00001",
      caseLabel: "ABCXXX",
      sampleId: "ABC001",
      sampleType: "biopsy",
      processingStatus: "received",
      qcStatus: "accepted",
      collectionDate: "2026-08-18",
      updatedAt: "2026-08-19T11:00:00.000Z",
    });

    mockTwoPQSamplings.set("SAMP-OTHER", {
      institutionId: "INST-00001",
      doctorId: "DOC-00001",
      patientId: "PAT-00001",
      parent_case: "CASE-OTHER",
      caseLabel: "DEFXXX",
      sampleId: "DEF001",
    });

    mockTransactionGet.mockResolvedValue({
      exists: false,
      data: () => undefined,
    });
  });

  it("finds a patient by normalized email and returns the reporting payload", async () => {
    const { getReportingPatient } =
      await import("../repositories/reporting.repository");

    const patient = await getReportingPatient({
      email: " ADA@example.com ",
    });

    expect(patient).toMatchObject({
      id: "PAT-00001",
      institutionId: "INST-00001",
      doctorId: "DOC-00001",
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      medicalRecordNumber: "MRN-1",
      birthDate: "1990-01-01",
      sex: "female",
      status: "active",
      additionalInformation: {
        documentId: "12345678",
      },
    });
  });

  it("finds a patient by 2PQ case or sampling code", async () => {
    const { getReportingPatient } =
      await import("../repositories/reporting.repository");

    const patient = await getReportingPatient({
      caseCode: "abc001",
    });

    expect(patient).toMatchObject({
      id: "PAT-00001",
      fullName: "Ada Lovelace",
      email: "ada@example.com",
    });
  });

  it("records an S3 upload notification in uploaded_reports and report_codes", async () => {
    const { recordUploadedReportNotification } =
      await import("../repositories/reporting.repository");

    const result = await recordUploadedReportNotification({
      patientId: "PAT-00001",
      reportId: "aws-report-1",
      reportCode: "REP-0001",
      bucket: "reports-bucket",
      key: "reports/PAT-00001/aws-report-1.pdf",
      fileName: "ada-report.pdf",
      contentType: "application/pdf",
      size: 1234,
      uploadedAt: "2026-08-19T12:30:00.000Z",
      providerName: "external-lab",
      reportType: "genetic",
      sampleId: "sample-1",
      downloadUrl: "https://reports.example.com/aws-report-1.pdf",
    });

    expect(result).toEqual({
      ok: true,
      reportId: "aws-report-1",
      reportCode: "REP-0001",
      patientId: "PAT-00001",
      status: "available",
    });

    expect(mockTransactionSet).toHaveBeenCalledTimes(2);
    expect(mockTransactionSet).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: "aws-report-1",
        collectionName: "uploaded_reports",
      }),
      expect.objectContaining({
        file_name: "ada-report.pdf",
        download_url: "https://reports.example.com/aws-report-1.pdf",
        provider_name: "external-lab",
        tracking_progress_status: "document_ready",
        report_code: "REP-0001",
        report_owner_id: "PAT-00001",
        owner_name: "Ada Lovelace",
        owner_email: "ada@example.com",
        patient_id: "PAT-00001",
        institution_id: "INST-00001",
        doctor_id: "DOC-00001",
        report_type: "genetic",
        sample_id: "sample-1",
        s3_bucket: "reports-bucket",
        s3_key: "reports/PAT-00001/aws-report-1.pdf",
        s3_content_type: "application/pdf",
        s3_size: 1234,
        s3_uploaded_at: "2026-08-19T12:30:00.000Z",
        external_report_id: "aws-report-1",
        integration_source: "aws_s3",
      }),
      { merge: true },
    );
    expect(mockTransactionSet).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: "REP-0001",
        collectionName: "report_codes",
      }),
      expect.objectContaining({
        owner_id: "PAT-00001",
        uploaded_report_id: "aws-report-1",
        source: "aws_s3",
      }),
      { merge: true },
    );
  });

  it("marks a linked 2PQ case ready and stores the callback download URL", async () => {
    const { recordUploadedReportNotification } =
      await import("../repositories/reporting.repository");

    mockTransactionGet
      .mockResolvedValueOnce({
        exists: false,
        data: () => undefined,
      })
      .mockResolvedValueOnce({
        exists: true,
        data: () => mockTwoPQCases.get("CASE-00001"),
      });

    await recordUploadedReportNotification({
      patientId: "PAT-00001",
      twoPQCaseId: "CASE-00001",
      reportId: "2pq-abc001",
      reportCode: "ABC001",
      bucket: "reports-bucket",
      key: "reports/2pq/ABC001.pdf",
      fileName: "ABC001.pdf",
      contentType: "application/pdf",
      uploadedAt: "2026-08-19T12:30:00.000Z",
      providerName: "aws-s3",
      reportType: "2pq",
      sampleId: "ABC001",
      downloadUrl: "https://reports.example.com/ABC001.pdf",
    });

    expect(mockTransactionSet).toHaveBeenCalledTimes(3);
    expect(mockTransactionSet).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        id: "CASE-00001",
        collectionName: "2pq_case",
      }),
      expect.objectContaining({
        caseStatus: "report_ready",
        download_url: "https://reports.example.com/ABC001.pdf",
        reportCode: "ABC001",
        uploadedReportId: "2pq-abc001",
        last_updated_date: expect.any(String),
        updatedAt: expect.any(String),
        updatedByEmail: "open-api",
      }),
      { merge: true },
    );
  });

  it("returns a current-case 2PQ snapshot by six-character sampling code", async () => {
    const { getReportingTwoPQCaseByCode } =
      await import("../repositories/reporting.repository");
    const currentCase = mockTwoPQCases.get("CASE-00001")!;
    currentCase.download_url = "https://reports.example.com/ABC001.pdf";
    currentCase.reportCode = "ABC001";
    currentCase.uploadedReportId = "2pq-abc001";

    const snapshot = await getReportingTwoPQCaseByCode("abc001");

    expect(snapshot).toMatchObject({
      code: "ABC001",
      main_case: {
        id: "CASE-00001",
        patient_id: "PAT-00001",
        institution_id: "INST-00001",
        doctor_id: "DOC-00001",
        children_sampling_ids: ["SAMP-00001"],
        last_updated: "2026-08-19T12:00:00.000Z",
      },
      patient: {
        id: "PAT-00001",
        fullName: "Ada Lovelace",
      },
      institution: {
        id: "INST-00001",
        name: "Fertility Clinic",
      },
      doctor: {
        id: "DOC-00001",
        name: "Dr. Grace Hopper",
      },
      entities: {
        cases: [
          {
            id: "CASE-00001",
            scope: {
              patientId: "PAT-00001",
            },
            relations: {
              samplingIds: ["SAMP-00001"],
            },
            report: {
              download_url: "https://reports.example.com/ABC001.pdf",
              reportCode: "ABC001",
              uploadedReportId: "2pq-abc001",
            },
          },
        ],
        samplings: [
          {
            id: "SAMP-00001",
            identity: {
              sampleId: "ABC001",
            },
            relations: {
              caseId: "CASE-00001",
            },
          },
        ],
      },
    });

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("SEQ-00001");
    expect(serialized).not.toContain("CASE-OTHER");
    expect(serialized).not.toContain("parent_batch");
    expect(serialized).not.toContain("sibling_case_ids");
  });
});
