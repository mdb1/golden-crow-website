export {};

type MockDocData = Record<string, unknown>;
type MockDocumentRef = { id: string; collectionName: string };

const mockPatients = new Map<string, MockDocData>();
const mockTransactionGet = jest.fn();
const mockTransactionSet = jest.fn();
const mockFieldValueIncrement = jest.fn((value: number) => ({
  __op: "increment",
  value,
}));
const mockServerTimestamp = jest.fn(() => ({
  __op: "serverTimestamp",
}));

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
    const source = this.collectionName === "patients" ? mockPatients : new Map();
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
        const source = this.collectionName === "patients" ? mockPatients : new Map();
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

const mockRunTransaction = jest.fn(async (callback: (transaction: unknown) => unknown) =>
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

    mockTransactionGet.mockResolvedValue({
      exists: false,
      data: () => undefined,
    });
  });

  it("finds a patient by normalized email and returns the reporting payload", async () => {
    const { getReportingPatient } = await import(
      "../repositories/reporting.repository"
    );

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

  it("records an S3 upload notification in uploaded_reports and report_codes", async () => {
    const { recordUploadedReportNotification } = await import(
      "../repositories/reporting.repository"
    );

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
});
