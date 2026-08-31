export {};

type MockDocData = Record<string, unknown>;
type MockDocumentRef = {
  id: string;
  collectionName: string;
  get: jest.Mock;
  set: jest.Mock;
  delete: jest.Mock;
};

const mockDocs = new Map<string, MockDocData>();
const legacyCollectionName = ["pgflex", "logistics"].join("_");
let mockAutoId = 0;
const mockCollection = jest.fn((collectionName: string) => ({
  doc: (id?: string) => makeDocRef(collectionName, id),
  where: jest.fn(() => {
    throw new Error(`Unexpected where() on ${collectionName}`);
  }),
  orderBy: jest.fn(() => {
    throw new Error(`Unexpected orderBy() on ${collectionName}`);
  }),
}));
const mockSendPGFlexLogisticsAssignmentEmail = jest.fn();
const mockGetUserRoleByEmail = jest.fn();

function docKey(ref: MockDocumentRef) {
  return `${ref.collectionName}/${ref.id}`;
}

function makeDocRef(collectionName: string, id?: string): MockDocumentRef {
  const documentId = id ?? `auto-${++mockAutoId}`;
  const ref: MockDocumentRef = {
    id: documentId,
    collectionName,
    get: jest.fn(async () => {
      const data = mockDocs.get(docKey(ref));
      return {
        exists: Boolean(data),
        id: documentId,
        data: () => data,
      };
    }),
    set: jest.fn(async (data: MockDocData) => {
      mockDocs.set(docKey(ref), { ...data });
    }),
    delete: jest.fn(async () => {
      mockDocs.delete(docKey(ref));
    }),
  };
  return ref;
}

function docsIn(collectionName: string) {
  return [...mockDocs.entries()]
    .filter(([key]) => key.startsWith(`${collectionName}/`))
    .map(([key, data]) => ({
      id: key.slice(collectionName.length + 1),
      data,
    }));
}

jest.mock("firebase-admin/firestore", () => ({
  FieldPath: {
    documentId: () => ({ __fieldPath: "__name__" }),
  },
}));

jest.mock("../config/firebase.js", () => ({
  adminAuthFor: jest.fn(() => ({})),
  adminDbFor: jest.fn(() => ({
    collection: mockCollection,
  })),
}));

jest.mock("../repositories/roles.repository.js", () => ({
  getUserRoleByEmail: mockGetUserRoleByEmail,
  normalizeRoleEmail: (email: string) => email.trim().toLowerCase(),
}));

jest.mock("../lib/pgflex-dispatcher-email.js", () => ({
  sendPGFlexLogisticsAssignmentEmail: mockSendPGFlexLogisticsAssignmentEmail,
}));

const fullAdminContext = {
  email: " ADMIN@example.com ",
  uid: "admin-1",
  role: "full_admin" as const,
  isBootstrap: false,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  projectAccess: ["mydnamap" as const],
};

describe("PGFlex logistics repository", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-31T15:45:00.000Z"));
    jest.spyOn(Math, "random").mockReturnValue(0.123456789);
    mockDocs.clear();
    mockAutoId = 0;
    mockCollection.mockClear();
    mockGetUserRoleByEmail.mockReset();
    mockSendPGFlexLogisticsAssignmentEmail.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("stores a created logistics item only in pgflex_events", async () => {
    const { createPGFlexLogisticsItemForContext } = await import(
      "../repositories/pgflex-logistics.repository"
    );

    const created = await createPGFlexLogisticsItemForContext(fullAdminContext, {
      identifier: "  ENV-001  ",
      description: "  Retiro inicial  ",
      origin: "Laboratorio Central",
      destination: "Clinica Norte",
      status: "in_transit",
    });

    const eventDocs = docsIn("pgflex_events");
    const legacyDocs = docsIn(legacyCollectionName);

    expect(eventDocs).toHaveLength(1);
    expect(legacyDocs).toHaveLength(0);
    expect(mockCollection).not.toHaveBeenCalledWith(legacyCollectionName);
    expect(created).toMatchObject({
      id: eventDocs[0]!.id,
      identifier: "ENV-001",
      description: "Retiro inicial",
      origin: "Laboratorio Central",
      destination: "Clinica Norte",
      status: "in_transit",
      timeRequested: "2026-08-31T15:45:00.000Z",
    });
    expect(eventDocs[0]!.data).toMatchObject({
      identifier: "ENV-001",
      description: "Retiro inicial",
      dispatcherId: null,
      dispatcherFirebaseId: null,
      dispatcherEmail: null,
      origin: "Laboratorio Central",
      destination: "Clinica Norte",
      status: "in_transit",
      timeRequested: "2026-08-31T15:45:00.000Z",
      createdByEmail: "admin@example.com",
    });
    expect(eventDocs[0]!.data).not.toHaveProperty("eventType");
    expect(eventDocs[0]!.data).not.toHaveProperty("logisticsItemId");
    expect(mockSendPGFlexLogisticsAssignmentEmail).not.toHaveBeenCalled();
  });
});
