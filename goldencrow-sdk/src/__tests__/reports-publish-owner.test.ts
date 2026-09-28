export {};

type MockData = Record<string, unknown>;
type MockRef = {
  collectionName: string;
  id: string;
  path: string;
  get: () => Promise<{
    exists: boolean;
    id: string;
    data: () => MockData | undefined;
  }>;
};

const mockDocs = new Map<string, MockData>();
let mockAutoId = 0;

function key(ref: MockRef) {
  return `${ref.collectionName}/${ref.id}`;
}

function ref(collectionName: string, id?: string): MockRef {
  const resolvedId = id ?? `auto-${++mockAutoId}`;
  const documentRef: MockRef = {
    collectionName,
    id: resolvedId,
    path: `${collectionName}/${resolvedId}`,
    get: async () => {
      const data = mockDocs.get(key(documentRef));
      return {
        exists: Boolean(data),
        id: documentRef.id,
        data: () => data,
      };
    },
  };
  return documentRef;
}

const mockDb = {
  collection: jest.fn((collectionName: string) => ({
    doc: (id?: string) => ref(collectionName, id),
  })),
  runTransaction: jest.fn(
    async (callback: (transaction: Record<string, jest.Mock>) => unknown) => {
      const transaction = {
        get: jest.fn(async (documentRef: MockRef) => {
          const data = mockDocs.get(key(documentRef));
          return {
            exists: Boolean(data),
            id: documentRef.id,
            data: () => data,
          };
        }),
        set: jest.fn(
          (
            documentRef: MockRef,
            data: MockData,
            options?: { merge?: boolean },
          ) => {
            mockDocs.set(key(documentRef), {
              ...(options?.merge ? mockDocs.get(key(documentRef)) : {}),
              ...data,
            });
          },
        ),
        update: jest.fn((documentRef: MockRef, data: MockData) => {
          mockDocs.set(key(documentRef), {
            ...mockDocs.get(key(documentRef)),
            ...data,
          });
        }),
      };
      return callback(transaction);
    },
  ),
  getAll: jest.fn(),
  batch: jest.fn(),
};

jest.mock("../config/firebase.js", () => ({
  adminDbFor: jest.fn(() => mockDb),
}));

describe("2PQ report-code owner persistence", () => {
  beforeEach(() => {
    jest.resetModules();
    mockDocs.clear();
    mockAutoId = 0;
    jest.clearAllMocks();
  });

  it("assigns the fixed 2PQ publisher to a new report", async () => {
    const { publishStoredFileAsReportCode } =
      await import("../repositories/reports.repository");
    const { TWO_PQ_REPORT_OWNER_EMAIL, TWO_PQ_REPORT_OWNER_ID } =
      await import("../lib/two-pq-report-owner");
    mockDocs.set("file_storage/file-1", {
      file_type: "2pq",
      file_content: JSON.stringify({ case: "CASE-00022" }),
      file_name: "CASE-00022.json",
    });
    mockDocs.set(`report_owners/${TWO_PQ_REPORT_OWNER_ID}`, {
      owner_name: "2pq",
      owner_contact_email: TWO_PQ_REPORT_OWNER_EMAIL,
    });

    const result = await publishStoredFileAsReportCode({
      fileId: "file-1",
      reportCode: "CANXXX",
    });

    expect(result).toMatchObject({
      created: true,
      ownerId: TWO_PQ_REPORT_OWNER_ID,
      ownerEmail: TWO_PQ_REPORT_OWNER_EMAIL,
      preservedExistingOwner: false,
    });
    expect(mockDocs.get("report_codes/CANXXX")).toMatchObject({
      owner_id: TWO_PQ_REPORT_OWNER_ID,
      uploaded_report_id: "auto-1",
    });
    expect(mockDocs.get("uploaded_reports/auto-1")).toMatchObject({
      report_code: "CANXXX",
      linked_file_id: "file-1",
      report_owner_id: TWO_PQ_REPORT_OWNER_ID,
      owner_email: TWO_PQ_REPORT_OWNER_EMAIL,
    });
  });

  it("updates an existing report while preserving every owner field", async () => {
    const { publishStoredFileAsReportCode } =
      await import("../repositories/reports.repository");
    mockDocs.set("file_storage/file-1", {
      file_type: "2pq",
      file_content: JSON.stringify({ case: "CASE-00022", updated: true }),
      file_name: "CASE-00022-updated.json",
      linked_report_code: "CANXXX",
    });
    mockDocs.set("report_codes/CANXXX", {
      owner_id: "legacy-owner",
      uploaded_report_id: "uploaded-1",
    });
    mockDocs.set("uploaded_reports/uploaded-1", {
      linked_file_id: "file-1",
      report_code: "CANXXX",
      report_owner_id: "legacy-owner",
      owner_community_user_id: "legacy-community-owner",
      owner_public_profile_id: "legacy-public-owner",
      owner_name: "Legacy owner",
      owner_email: "legacy@example.com",
      provider_name: "legacy-provider",
    });

    const result = await publishStoredFileAsReportCode({
      fileId: "file-1",
      reportCode: "CANXXX",
    });

    expect(result).toMatchObject({
      created: false,
      ownerId: "legacy-owner",
      ownerEmail: "legacy@example.com",
      preservedExistingOwner: true,
    });
    expect(mockDocs.get("report_codes/CANXXX")).toMatchObject({
      owner_id: "legacy-owner",
      uploaded_report_id: "uploaded-1",
    });
    expect(mockDocs.get("uploaded_reports/uploaded-1")).toMatchObject({
      file_name: "CASE-00022-updated.json",
      report_owner_id: "legacy-owner",
      owner_community_user_id: "legacy-community-owner",
      owner_public_profile_id: "legacy-public-owner",
      owner_name: "Legacy owner",
      owner_email: "legacy@example.com",
      provider_name: "legacy-provider",
    });
  });

  it("normalizes stale admin metadata when the report already uses the fixed 2PQ owner", async () => {
    const { publishStoredFileAsReportCode } =
      await import("../repositories/reports.repository");
    const { TWO_PQ_REPORT_OWNER_EMAIL, TWO_PQ_REPORT_OWNER_ID } =
      await import("../lib/two-pq-report-owner");
    mockDocs.set("file_storage/file-1", {
      file_type: "2pq",
      file_content: JSON.stringify({ case: "CASE-00022" }),
      linked_report_code: "CANXXX",
    });
    mockDocs.set("report_codes/CANXXX", {
      owner_id: TWO_PQ_REPORT_OWNER_ID,
      uploaded_report_id: "uploaded-1",
    });
    mockDocs.set("uploaded_reports/uploaded-1", {
      linked_file_id: "file-1",
      report_owner_id: "old-admin-uid",
      owner_community_user_id: "old-admin-uid",
      owner_public_profile_id: "old-admin-uid",
      owner_name: "Old admin",
      owner_email: "old-admin@example.com",
      provider_name: "old-admin@example.com",
    });

    await publishStoredFileAsReportCode({
      fileId: "file-1",
      reportCode: "CANXXX",
    });

    expect(mockDocs.get("uploaded_reports/uploaded-1")).toMatchObject({
      report_owner_id: TWO_PQ_REPORT_OWNER_ID,
      owner_community_user_id: TWO_PQ_REPORT_OWNER_ID,
      owner_public_profile_id: TWO_PQ_REPORT_OWNER_ID,
      owner_name: "2pq",
      owner_email: TWO_PQ_REPORT_OWNER_EMAIL,
      provider_name: "2pq",
    });
  });

  it("reads the displayed owner identity from the authoritative report-owner document", async () => {
    const { getReportById } =
      await import("../repositories/reports.repository");
    mockDocs.set("report_codes/CANXXX", {
      owner_id: "legacy-owner",
      uploaded_report_id: "uploaded-1",
    });
    mockDocs.set("uploaded_reports/uploaded-1", {
      linked_file_id: "file-1",
      owner_name: "Stale admin",
      owner_email: "stale-admin@example.com",
    });
    mockDocs.set("report_owners/legacy-owner", {
      owner_name: "Existing report owner",
      owner_contact_email: "owner@example.com",
    });

    await expect(getReportById("CANXXX")).resolves.toMatchObject({
      userId: "legacy-owner",
      ownerName: "Existing report owner",
      ownerEmail: "owner@example.com",
    });
  });

  it("still rejects repointing an existing report code to another file", async () => {
    const { publishStoredFileAsReportCode } =
      await import("../repositories/reports.repository");
    mockDocs.set("file_storage/file-1", {
      file_type: "2pq",
      file_content: JSON.stringify({ case: "CASE-00022" }),
    });
    mockDocs.set("report_codes/CANXXX", {
      owner_id: "legacy-owner",
      uploaded_report_id: "uploaded-1",
    });
    mockDocs.set("uploaded_reports/uploaded-1", {
      linked_file_id: "another-file",
      report_owner_id: "legacy-owner",
    });

    await expect(
      publishStoredFileAsReportCode({
        fileId: "file-1",
        reportCode: "CANXXX",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
