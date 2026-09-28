export {};

type MockData = Record<string, unknown>;
const mockDocs = new Map<string, MockData>();
type MockQuery = {
  startAfter: jest.Mock;
  limit: jest.Mock;
  get: jest.Mock;
};

function snapshot(id: string, data: MockData | undefined) {
  return {
    exists: Boolean(data),
    id,
    data: () => data,
  };
}

function reportOwnerDocs() {
  return [...mockDocs.entries()]
    .filter(([key]) => key.startsWith("report_owners/"))
    .map(([key, data]) => snapshot(key.slice("report_owners/".length), data))
    .sort((left, right) => left.id.localeCompare(right.id));
}

const mockCollection = jest.fn((collectionName: string) => ({
  doc: (id: string) => ({
    id,
    get: jest.fn(async () =>
      snapshot(id, mockDocs.get(`${collectionName}/${id}`)),
    ),
  }),
  orderBy: jest.fn(() => {
    let cursor = "";
    let limit = 20;
    const query: MockQuery = {
      startAfter: jest.fn((nextCursor: string) => {
        cursor = nextCursor;
        return query;
      }),
      limit: jest.fn((nextLimit: number) => {
        limit = nextLimit;
        return query;
      }),
      get: jest.fn(async () => ({
        docs: reportOwnerDocs()
          .filter((doc) => !cursor || doc.id > cursor)
          .slice(0, limit),
      })),
    };
    return query;
  }),
}));

jest.mock("../config/firebase.js", () => ({
  adminDbFor: jest.fn(() => ({ collection: mockCollection })),
}));

const fullAdminContext = {
  email: "admin@example.com",
  uid: "admin-uid",
  role: "full_admin" as const,
  isBootstrap: false,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  canAccessPublisherPortal: false,
  projectAccess: ["mydnamap" as const],
};

describe("report owner visibility", () => {
  beforeEach(() => {
    jest.resetModules();
    mockDocs.clear();
    mockCollection.mockClear();
  });

  it("paginates every report owner for full admins", async () => {
    const { listReportOwnerDocumentsForContext } =
      await import("../repositories/moderation.repository");
    mockDocs.set("report_owners/owner-a", { owner_name: "Organization" });
    mockDocs.set("report_owners/owner-b", { owner_name: "Professional" });
    mockDocs.set("report_owners/owner-c", { owner_name: "Patient" });

    const first = await listReportOwnerDocumentsForContext(fullAdminContext, {
      limit: 2,
    });
    const second = await listReportOwnerDocumentsForContext(fullAdminContext, {
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });

    expect(first.documents.map((document) => document.id)).toEqual([
      "owner-a",
      "owner-b",
    ]);
    expect(first.nextCursor).toBe("owner-b");
    expect(second.documents.map((document) => document.id)).toEqual([
      "owner-c",
    ]);
    expect(second.nextCursor).toBeNull();
  });

  it("returns only the fixed 2PQ owner to 2PQ admins", async () => {
    const { listReportOwnerDocumentsForContext } =
      await import("../repositories/moderation.repository");
    const { TWO_PQ_REPORT_OWNER_ID } =
      await import("../lib/two-pq-report-owner");
    mockDocs.set(`report_owners/${TWO_PQ_REPORT_OWNER_ID}`, {
      owner_contact_email: "info@2pq.life",
    });
    mockDocs.set("report_owners/hidden-professional", {
      owner_contact_email: "professional@example.com",
    });

    const page = await listReportOwnerDocumentsForContext(
      { ...fullAdminContext, role: "2pq_admin" },
      { limit: 20 },
    );

    expect(page.documents.map((document) => document.id)).toEqual([
      TWO_PQ_REPORT_OWNER_ID,
    ]);
    expect(page.nextCursor).toBeNull();
  });
});
