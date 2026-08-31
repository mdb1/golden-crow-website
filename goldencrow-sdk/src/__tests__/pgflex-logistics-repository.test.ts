export {};

type MockDocData = Record<string, unknown>;
type MockDocumentRef = {
  id: string;
  collectionName: string;
  get: jest.Mock;
  set: jest.Mock;
  delete: jest.Mock;
};
type MockQueryOperation =
  | { type: "where"; fieldPath: string; operator: string; value: unknown }
  | { type: "orderBy"; fieldPath: string; direction: "asc" | "desc" }
  | { type: "startAfter"; values: unknown[] }
  | { type: "limit"; count: number };
type MockQuery = {
  doc: (id?: string) => MockDocumentRef;
  where: jest.Mock;
  orderBy: jest.Mock;
  startAfter: jest.Mock;
  limit: jest.Mock;
  get: jest.Mock;
};

const mockDocs = new Map<string, MockDocData>();
const legacyCollectionName = ["pgflex", "logistics"].join("_");
const mockQueryOperations: MockQueryOperation[] = [];
let mockAutoId = 0;
const mockCollection = jest.fn((collectionName: string) =>
  makeQuery(collectionName),
);
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

function fieldPathName(fieldPath: unknown) {
  if (typeof fieldPath === "string") {
    return fieldPath;
  }

  if (
    fieldPath &&
    typeof fieldPath === "object" &&
    "__fieldPath" in fieldPath &&
    fieldPath.__fieldPath === "__name__"
  ) {
    return "__name__";
  }

  return String(fieldPath);
}

function valueForField(doc: { id: string; data: MockDocData }, fieldPath: string) {
  return fieldPath === "__name__" ? doc.id : doc.data[fieldPath];
}

function compareValues(
  left: unknown,
  right: unknown,
  direction: "asc" | "desc",
) {
  const leftValue = String(left ?? "");
  const rightValue = String(right ?? "");
  const comparison = leftValue.localeCompare(rightValue);
  return direction === "desc" ? comparison * -1 : comparison;
}

function applyQueryOperations(
  collectionName: string,
  operations: MockQueryOperation[],
) {
  let docs = docsIn(collectionName).map((doc) => ({
    id: doc.id,
    data: doc.data,
  }));

  for (const operation of operations) {
    if (operation.type !== "where") {
      continue;
    }

    docs = docs.filter((doc) => {
      const value = valueForField(doc, operation.fieldPath);
      if (operation.operator === "==") {
        return value === operation.value;
      }

      if (operation.operator === "in" && Array.isArray(operation.value)) {
        return operation.value.includes(value);
      }

      throw new Error(`Unsupported mock where operator: ${operation.operator}`);
    });
  }

  const orderOperations = operations.filter(
    (operation): operation is Extract<MockQueryOperation, { type: "orderBy" }> =>
      operation.type === "orderBy",
  );

  if (orderOperations.length > 0) {
    docs = [...docs].sort((left, right) => {
      for (const operation of orderOperations) {
        const comparison = compareValues(
          valueForField(left, operation.fieldPath),
          valueForField(right, operation.fieldPath),
          operation.direction,
        );

        if (comparison !== 0) {
          return comparison;
        }
      }

      return 0;
    });
  }

  const startAfter = operations.find(
    (operation): operation is Extract<MockQueryOperation, { type: "startAfter" }> =>
      operation.type === "startAfter",
  );

  if (startAfter && orderOperations.length > 0) {
    const cursorIndex = docs.findIndex((doc) =>
      orderOperations.every(
        (operation, index) =>
          valueForField(doc, operation.fieldPath) === startAfter.values[index],
      ),
    );

    if (cursorIndex >= 0) {
      docs = docs.slice(cursorIndex + 1);
    }
  }

  const limit = operations.find(
    (operation): operation is Extract<MockQueryOperation, { type: "limit" }> =>
      operation.type === "limit",
  );

  if (limit) {
    docs = docs.slice(0, limit.count);
  }

  return docs.map((doc) => ({
    exists: true,
    id: doc.id,
    data: () => doc.data,
  }));
}

function makeQuery(
  collectionName: string,
  operations: MockQueryOperation[] = [],
): MockQuery {
  return {
    doc: (id?: string) => makeDocRef(collectionName, id),
    where: jest.fn((fieldPath: unknown, operator: string, value: unknown): MockQuery => {
      const operation: MockQueryOperation = {
        type: "where",
        fieldPath: fieldPathName(fieldPath),
        operator,
        value,
      };
      mockQueryOperations.push(operation);
      return makeQuery(collectionName, [...operations, operation]);
    }),
    orderBy: jest.fn((fieldPath: unknown, direction: "asc" | "desc"): MockQuery => {
      const operation: MockQueryOperation = {
        type: "orderBy",
        fieldPath: fieldPathName(fieldPath),
        direction,
      };
      mockQueryOperations.push(operation);
      return makeQuery(collectionName, [...operations, operation]);
    }),
    startAfter: jest.fn((...values: unknown[]): MockQuery => {
      const operation: MockQueryOperation = { type: "startAfter", values };
      mockQueryOperations.push(operation);
      return makeQuery(collectionName, [...operations, operation]);
    }),
    limit: jest.fn((count: number): MockQuery => {
      const operation: MockQueryOperation = { type: "limit", count };
      mockQueryOperations.push(operation);
      return makeQuery(collectionName, [...operations, operation]);
    }),
    get: jest.fn(async () => ({
      docs: applyQueryOperations(collectionName, operations),
    })),
  };
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
    mockQueryOperations.length = 0;
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

  it("lists scoped logistics items by requested time newest first", async () => {
    const { listPGFlexLogisticsForContext } = await import(
      "../repositories/pgflex-logistics.repository"
    );

    mockDocs.set("pgflex_events/older-active", {
      identifier: "ACTIVE-OLD",
      origin: "Origen A",
      destination: "Destino A",
      status: "awaiting_pick_up",
      timeRequested: "2026-08-30T10:00:00.000Z",
      createdAt: "2026-08-30T10:00:00.000Z",
      updatedAt: "2026-08-30T10:00:00.000Z",
    });
    mockDocs.set("pgflex_events/newer-active", {
      identifier: "ACTIVE-NEW",
      origin: "Origen B",
      destination: "Destino B",
      status: "in_transit",
      timeRequested: "2026-08-31T12:00:00.000Z",
      createdAt: "2026-08-31T12:00:00.000Z",
      updatedAt: "2026-08-31T12:00:00.000Z",
    });
    mockDocs.set("pgflex_events/newest-finished", {
      identifier: "FINISHED-NEW",
      origin: "Origen C",
      destination: "Destino C",
      status: "arrived",
      timeRequested: "2026-09-01T08:00:00.000Z",
      createdAt: "2026-09-01T08:00:00.000Z",
      updatedAt: "2026-09-01T08:00:00.000Z",
    });
    mockDocs.set("pgflex_events/older-finished", {
      identifier: "FINISHED-OLD",
      origin: "Origen D",
      destination: "Destino D",
      status: "lost",
      timeRequested: "2026-08-29T08:00:00.000Z",
      createdAt: "2026-08-29T08:00:00.000Z",
      updatedAt: "2026-08-29T08:00:00.000Z",
    });

    const activePage = await listPGFlexLogisticsForContext(fullAdminContext, {
      scope: "active",
      limit: 10,
    });

    expect(activePage.scope).toBe("active");
    expect(activePage.items.map((item) => item.id)).toEqual([
      "newer-active",
      "older-active",
    ]);
    expect(mockQueryOperations).toEqual(
      expect.arrayContaining([
        {
          type: "where",
          fieldPath: "status",
          operator: "in",
          value: ["awaiting_pick_up", "in_transit"],
        },
        {
          type: "orderBy",
          fieldPath: "timeRequested",
          direction: "desc",
        },
        {
          type: "orderBy",
          fieldPath: "__name__",
          direction: "desc",
        },
      ]),
    );

    const finishedPage = await listPGFlexLogisticsForContext(fullAdminContext, {
      scope: "finished",
      limit: 10,
    });

    expect(finishedPage.scope).toBe("finished");
    expect(finishedPage.items.map((item) => item.id)).toEqual([
      "newest-finished",
      "older-finished",
    ]);
  });
});
