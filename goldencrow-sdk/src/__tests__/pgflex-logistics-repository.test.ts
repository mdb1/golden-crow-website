export {};

import type { Transaction } from "firebase-admin/firestore";

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
const mockSendTreatmentPickupEmail = jest.fn();
const mockGetUserRoleByEmail = jest.fn();
const mockSynchronizeTwoPQCasesFilesAndCodes = jest.fn();
const mockCascadeTwoPQCaseStatusToSamplingChildren = jest.fn();

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
        ref,
        data: () => data,
      };
    }),
    set: jest.fn(async (data: MockDocData, options?: { merge?: boolean }) => {
      const current = mockDocs.get(docKey(ref)) ?? {};
      const next = options?.merge ? { ...current, ...data } : { ...data };
      if (options?.merge && data.notifications) {
        next.notifications = {
          ...(current.notifications as MockDocData | undefined),
          ...(data.notifications as MockDocData),
        };
      }
      mockDocs.set(docKey(ref), next);
    }),
    delete: jest.fn(async () => {
      mockDocs.delete(docKey(ref));
    }),
  };
  return ref;
}

function runTestTransaction<T>(callback: (transaction: Transaction) => Promise<T>) {
  return callback({
    get: (ref: MockDocumentRef) => ref.get(),
    set: (ref: MockDocumentRef, data: MockDocData, options?: { merge?: boolean }) => {
      void ref.set(data, options);
    },
  } as unknown as Transaction);
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

function valueForField(
  doc: { id: string; data: MockDocData },
  fieldPath: string,
) {
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
    (
      operation,
    ): operation is Extract<MockQueryOperation, { type: "orderBy" }> =>
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
    (
      operation,
    ): operation is Extract<MockQueryOperation, { type: "startAfter" }> =>
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
    where: jest.fn(
      (fieldPath: unknown, operator: string, value: unknown): MockQuery => {
        const operation: MockQueryOperation = {
          type: "where",
          fieldPath: fieldPathName(fieldPath),
          operator,
          value,
        };
        mockQueryOperations.push(operation);
        return makeQuery(collectionName, [...operations, operation]);
      },
    ),
    orderBy: jest.fn(
      (fieldPath: unknown, direction: "asc" | "desc"): MockQuery => {
        const operation: MockQueryOperation = {
          type: "orderBy",
          fieldPath: fieldPathName(fieldPath),
          direction,
        };
        mockQueryOperations.push(operation);
        return makeQuery(collectionName, [...operations, operation]);
      },
    ),
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
    runTransaction: runTestTransaction,
  })),
}));

jest.mock("../repositories/roles.repository.js", () => ({
  getUserRoleByEmail: mockGetUserRoleByEmail,
  normalizeRoleEmail: (email: string) => email.trim().toLowerCase(),
}));

jest.mock("../lib/pgflex-dispatcher-email.js", () => ({
  sendPGFlexLogisticsAssignmentEmail: mockSendPGFlexLogisticsAssignmentEmail,
  sendTreatmentPickupEmail: mockSendTreatmentPickupEmail,
}));

jest.mock("../repositories/two-pq-auto-sync.repository.js", () => ({
  synchronizeTwoPQCasesFilesAndCodes:
    mockSynchronizeTwoPQCasesFilesAndCodes,
}));

jest.mock("../repositories/two-pq-sampling-status.repository.js", () => ({
  cascadeTwoPQCaseStatusToSamplingChildren:
    mockCascadeTwoPQCaseStatusToSamplingChildren,
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

const transportDispatcherContext = {
  email: "driver@example.com",
  uid: "driver-1",
  role: "transport_dispatcher" as const,
  isBootstrap: false,
  canAccessBackoffice: false,
  canAccessPatientPortal: false,
  canAccessPGFlex: true,
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
    mockSynchronizeTwoPQCasesFilesAndCodes.mockClear();
    mockCascadeTwoPQCaseStatusToSamplingChildren.mockClear();
    mockSendPGFlexLogisticsAssignmentEmail.mockReset();
    mockSendTreatmentPickupEmail.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("plans a shared frozen pickup, waits for all biopsies, and dispatches the same request", async () => {
    const {
      prepareTreatmentPickup,
      prepareBiopsyPickupConfirmation,
      prepareTreatmentPickupCaseDetachment,
      deliverTreatmentPickupNotifications,
      updateTreatmentPickupForContext,
    } = await import("../repositories/two-pq-pickup.repository.js");
    const { listPGFlexLogisticsForContext, updatePGFlexLogisticsItemForContext } =
      await import("../repositories/pgflex-logistics.repository.js");
    const now = "2026-11-29T12:00:00.000Z";
    const origin = "Av. Corrientes 123, Almagro, Ciudad Autónoma de Buenos Aires, Argentina";
    const destination = "Humboldt 2433 (PB 10), Palermo, Ciudad Autónoma de Buenos Aires, Argentina";
    const planned = {
      institutionId: "INST-1",
      institutionName: "Clínica",
      doctorId: "DOC-1",
      actorRole: "institution_operator" as const,
      actorEmail: "operator@example.com",
      now,
      dispatcher: { email: transportDispatcherContext.email, firebaseUid: transportDispatcherContext.uid },
      treatmentStart: {
        studyType: "pgtAStandard" as const,
        treatmentDate: "2026-11-25",
        estimatedBiopsyDate: "2026-11-29",
        estimatedEmbryoCount: 5,
        pickupDate: "2026-11-30",
        pickupWindowStart: "09:00",
        pickupWindowEnd: "11:00",
        pickupOrigin: origin,
        pickupDestination: "Legacy client destination",
        temperatureC: -20 as const,
        notes: "Sin observaciones",
      },
    };
    async function savePlan(formId: string, groupWithTreatmentStartFormId?: string) {
      const id = await runTestTransaction(async (transaction) => {
        const plan = await prepareTreatmentPickup(transaction, { ...planned, formId, groupWithTreatmentStartFormId });
        plan.write();
        return plan.id;
      });
      mockDocs.set(`2pq_forms/${formId}`, {
        formType: "treatment_start",
        institutionId: "INST-1",
        transportEventId: id,
        linkedStudyRequestFormId: `REQUEST-${formId}`,
      });
      await deliverTreatmentPickupNotifications(id);
      return id;
    }
    const id = await savePlan("FORM-1");
    await deliverTreatmentPickupNotifications(id);
    expect(mockSendTreatmentPickupEmail.mock.calls.map(([kind]) => kind)).toEqual(["planned"]);
    const pickupRef = `pgflex_events/${id}`;
    mockDocs.set(pickupRef, {
      ...mockDocs.get(pickupRef),
      origin: "Av. Corrientes 123, Almagro, Capital Federal, Argentina",
    });
    expect(await savePlan("FORM-2", "FORM-1")).toBe(id);
    expect(docsIn("pgflex_events")).toHaveLength(1);
    expect(await listPGFlexLogisticsForContext(transportDispatcherContext, { scope: "planned" }))
      .toMatchObject({ items: [{ id, status: "planned", destination, expectedCaseCount: 2, canUpdate: false }] });
    expect(await listPGFlexLogisticsForContext(transportDispatcherContext))
      .toMatchObject({ items: [] });
    await expect(updatePGFlexLogisticsItemForContext(transportDispatcherContext, id, { status: "in_transit" }))
      .rejects.toMatchObject({ statusCode: 409 });

    async function saveBiopsy(formId: string, caseId: string, threeLetterCode: string) {
      return runTestTransaction(async (transaction) => {
        const result = await prepareBiopsyPickupConfirmation(transaction, {
          eventId: id, formId, caseId, threeLetterCode, biopsyDate: "2026-11-29", actorEmail: planned.actorEmail, now,
        });
        result.write();
        return result.confirmedCaseIds;
      });
    }
    expect(await saveBiopsy("FORM-1", "CASE-1", "ABC")).toEqual([]);
    await deliverTreatmentPickupNotifications(id);
    expect(mockSendTreatmentPickupEmail.mock.calls.map(([kind]) => kind)).toEqual(["planned", "planned"]);
    expect(await saveBiopsy("FORM-2", "CASE-2", "DEF")).toEqual(["CASE-1", "CASE-2"]);
    await deliverTreatmentPickupNotifications(id);
    await deliverTreatmentPickupNotifications(id);
    expect(mockSendTreatmentPickupEmail.mock.calls.map(([kind]) => kind)).toEqual(["planned", "planned", "confirmed"]);
    expect(mockSendTreatmentPickupEmail).toHaveBeenLastCalledWith("confirmed",
      expect.objectContaining({ email: "driver@example.com" }),
      expect.objectContaining({ id, destination, expectedCaseCount: 2, codes: ["ABC", "DEF"] }),
    );

    for (const caseId of ["CASE-1", "CASE-2"]) {
      mockDocs.set(`2pq_case/${caseId}`, { transportEventId: id, caseStatus: "awaiting_pick_up" });
    }
    expect(await updateTreatmentPickupForContext(fullAdminContext, "FORM-1", { action: "cancel" }))
      .toMatchObject({ id, status: "cancelled", latestEmailStatus: "sent" });
    expect(mockDocs.get("2pq_case/CASE-1")?.caseStatus).toBe("intake");
    const reschedule = {
      action: "reschedule" as const,
      pickupDate: "2026-12-01",
      pickupWindowStart: "10:00",
      pickupWindowEnd: "12:00",
      pickupOrigin: origin,
      pickupDestination: "Legacy client destination",
    };
    await expect(updateTreatmentPickupForContext(fullAdminContext, "FORM-1", {
      ...reschedule,
      pickupOrigin: "Av. Corrientes 123, Almagro, Ciudad Autónoma de Buenos Aires, Uruguay",
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(await updateTreatmentPickupForContext(fullAdminContext, "FORM-1", reschedule))
      .toMatchObject({ id, status: "confirmed", destination, pickupDate: "2026-12-01" });
    expect(mockDocs.get("2pq_case/CASE-1")?.caseStatus).toBe("awaiting_pick_up");
    await runTestTransaction(async (transaction) => {
      const detach = await prepareTreatmentPickupCaseDetachment(transaction, {
        eventId: id, formId: "FORM-1", caseId: "CASE-1", actorEmail: planned.actorEmail, now,
      });
      detach?.write();
      mockDocs.delete("2pq_case/CASE-1");
    });
    expect(mockDocs.get(`pgflex_events/${id}`)).toMatchObject({
      linkedCaseIds: ["CASE-2"], linked_codes: "DEF", expectedCaseCount: 1, readyCaseCount: 1,
    });
    expect(await updatePGFlexLogisticsItemForContext(transportDispatcherContext, id, { status: "in_transit" }))
      .toMatchObject({ id, status: "in_transit" });
    expect(mockDocs.get("2pq_case/CASE-1")).toBeUndefined();
    expect(mockDocs.get("2pq_case/CASE-2")?.caseStatus).toBe("in_transit");
  });

  it("stores a created logistics item only in pgflex_events", async () => {
    const { createPGFlexLogisticsItemForContext } =
      await import("../repositories/pgflex-logistics.repository");

    const created = await createPGFlexLogisticsItemForContext(
      fullAdminContext,
      {
        identifier: "  ENV-001  ",
        shipmentType: "2pq",
        description: "  Retiro inicial  ",
        linked_codes: " abc, DEF,abc ",
        origin: "Laboratorio Central",
        status: "in_transit",
      },
    );

    const eventDocs = docsIn("pgflex_events");
    const legacyDocs = docsIn(legacyCollectionName);

    expect(eventDocs).toHaveLength(1);
    expect(legacyDocs).toHaveLength(0);
    expect(mockCollection).not.toHaveBeenCalledWith(legacyCollectionName);
    expect(created).toMatchObject({
      id: eventDocs[0]!.id,
      identifier: "ENV-001",
      shipmentType: "2pq",
      description: "Retiro inicial",
      linked_codes: "ABC,DEF",
      origin: "Laboratorio Central",
      destination:
        "Humboldt 2433 (PB 10), Palermo, Ciudad Autónoma de Buenos Aires, Argentina",
      status: "in_transit",
      timeRequested: "2026-08-31T15:45:00.000Z",
    });
    expect(eventDocs[0]!.data).toMatchObject({
      identifier: "ENV-001",
      shipmentType: "2pq",
      description: "Retiro inicial",
      linked_codes: "ABC,DEF",
      dispatcherId: null,
      dispatcherFirebaseId: null,
      dispatcherEmail: null,
      origin: "Laboratorio Central",
      destination:
        "Humboldt 2433 (PB 10), Palermo, Ciudad Autónoma de Buenos Aires, Argentina",
      status: "in_transit",
      timeRequested: "2026-08-31T15:45:00.000Z",
      createdByEmail: "admin@example.com",
    });
    expect(eventDocs[0]!.data).not.toHaveProperty("eventType");
    expect(eventDocs[0]!.data).not.toHaveProperty("logisticsItemId");
    expect(mockSendPGFlexLogisticsAssignmentEmail).not.toHaveBeenCalled();
  });

  it("stores other logistics items with an editable destination and no linked codes", async () => {
    const { createPGFlexLogisticsItemForContext } =
      await import("../repositories/pgflex-logistics.repository");

    const created = await createPGFlexLogisticsItemForContext(
      fullAdminContext,
      {
        identifier: "ENV-OTHER",
        shipmentType: "other",
        linked_codes: "ABC",
        origin: "Laboratorio Central",
        destination: "Clinica Norte",
      },
    );

    const eventDocs = docsIn("pgflex_events");

    expect(created).toMatchObject({
      shipmentType: "other",
      linked_codes: undefined,
      destination: "Clinica Norte",
    });
    expect(eventDocs[0]!.data).toMatchObject({
      identifier: "ENV-OTHER",
      shipmentType: "other",
      linked_codes: null,
      destination: "Clinica Norte",
    });
  });

  it("rejects malformed linked codes before storing the logistics item", async () => {
    const { createPGFlexLogisticsItemForContext } =
      await import("../repositories/pgflex-logistics.repository");

    await expect(
      createPGFlexLogisticsItemForContext(fullAdminContext, {
        identifier: "ENV-002",
        linked_codes: "ABC,AB1",
        origin: "Laboratorio Central",
        destination: "Clinica Norte",
      }),
    ).rejects.toMatchObject({
      message: "Linked codes must contain only comma-separated 3-letter codes.",
      statusCode: 400,
    });

    expect(docsIn("pgflex_events")).toHaveLength(0);
  });

  it("lists scoped logistics items by requested time newest first", async () => {
    const { listPGFlexLogisticsForContext } =
      await import("../repositories/pgflex-logistics.repository");

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
          value: ["confirmed", "awaiting_pick_up", "in_transit"],
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

  it("syncs linked 2PQ cases when a full admin saves a 2PQ dispatch in transit", async () => {
    const { replacePGFlexLogisticsItemForContext } =
      await import("../repositories/pgflex-logistics.repository");
    mockDocs.set("pgflex_events/dispatch-admin", {
      identifier: "ENV-ADMIN",
      shipmentType: "2pq",
      linked_codes: "ABC",
      origin: "Clinica Norte",
      destination:
        "Humboldt 2433 (PB 10), Palermo, Ciudad Autónoma de Buenos Aires, Argentina",
      status: "awaiting_pick_up",
      timeRequested: "2026-08-31T10:00:00.000Z",
      createdAt: "2026-08-31T10:00:00.000Z",
      updatedAt: "2026-08-31T10:00:00.000Z",
      createdByEmail: "admin@example.com",
      updatedByEmail: "admin@example.com",
    });
    mockDocs.set("2pq_case/case-a", {
      caseLabel: "ABCXXX",
      three_letter_code: "ABC",
      caseStatus: "awaiting_pick_up",
    });

    await replacePGFlexLogisticsItemForContext(
      fullAdminContext,
      "dispatch-admin",
      {
        identifier: "ENV-ADMIN",
        shipmentType: "2pq",
        linked_codes: "ABC",
        origin: "Clinica Norte",
        status: "in_transit",
      },
    );

    expect(mockDocs.get("2pq_case/case-a")).toMatchObject({
      caseStatus: "in_transit",
      last_updated_date: "2026-08-31T15:45:00.000Z",
      updatedAt: "2026-08-31T15:45:00.000Z",
      updatedByEmail: "admin@example.com",
    });
    expect(mockSynchronizeTwoPQCasesFilesAndCodes).toHaveBeenCalledWith(
      ["case-a"],
      "admin@example.com",
    );
    expect(
      mockCascadeTwoPQCaseStatusToSamplingChildren,
    ).toHaveBeenCalledWith({
      caseId: "case-a",
      previousCaseStatus: "awaiting_pick_up",
      nextCaseStatus: "in_transit",
      actorEmail: "admin@example.com",
    });
    expect(
      mockCascadeTwoPQCaseStatusToSamplingChildren.mock.invocationCallOrder[0]!,
    ).toBeLessThan(
      mockSynchronizeTwoPQCasesFilesAndCodes.mock.invocationCallOrder[0]!,
    );
  });

  it("lets an assigned transport dispatcher mark a dispatch as picked up", async () => {
    const { updatePGFlexLogisticsItemForContext } =
      await import("../repositories/pgflex-logistics.repository");
    mockDocs.set("pgflex_events/dispatch-1", {
      identifier: "ENV-001",
      shipmentType: "2pq",
      linked_codes: "ABC,DEF",
      origin: "Clinica Norte",
      destination:
        "Humboldt 2433 (PB 10), Palermo, Ciudad Autónoma de Buenos Aires, Argentina",
      dispatcherId: "driver-1",
      dispatcherFirebaseId: "driver-1",
      dispatcherEmail: "driver@example.com",
      status: "awaiting_pick_up",
      timeRequested: "2026-08-31T10:00:00.000Z",
      createdAt: "2026-08-31T10:00:00.000Z",
      updatedAt: "2026-08-31T10:00:00.000Z",
    });
    mockDocs.set("2pq_case/case-a", {
      caseLabel: "ABCXXX",
      three_letter_code: "ABC",
      caseStatus: "awaiting_pick_up",
      updatedAt: "2026-08-31T10:00:00.000Z",
    });
    mockDocs.set("2pq_case/case-b", {
      caseLabel: "DEFXXX",
      three_letter_code: "DEF",
      caseStatus: "awaiting_pick_up",
      updatedAt: "2026-08-31T10:00:00.000Z",
    });

    const updated = await updatePGFlexLogisticsItemForContext(
      transportDispatcherContext,
      "dispatch-1",
      { status: "in_transit" },
    );

    expect(updated).toMatchObject({
      status: "in_transit",
      item_was_picked_date_at: "2026-08-31T15:45:00.000Z",
      canUpdate: true,
    });
    expect(mockDocs.get("pgflex_events/dispatch-1")).toMatchObject({
      status: "in_transit",
      item_was_picked_date_at: "2026-08-31T15:45:00.000Z",
      updatedAt: "2026-08-31T15:45:00.000Z",
      updatedByEmail: "driver@example.com",
    });
    expect(mockDocs.get("2pq_case/case-a")).toMatchObject({
      caseStatus: "in_transit",
      last_updated_date: "2026-08-31T15:45:00.000Z",
      updatedAt: "2026-08-31T15:45:00.000Z",
      updatedByEmail: "driver@example.com",
    });
    expect(mockDocs.get("2pq_case/case-b")).toMatchObject({
      caseStatus: "in_transit",
      last_updated_date: "2026-08-31T15:45:00.000Z",
      updatedAt: "2026-08-31T15:45:00.000Z",
      updatedByEmail: "driver@example.com",
    });
  });

  it("lets a full admin use the operational pickup transition and sync linked 2PQ cases", async () => {
    const { updatePGFlexLogisticsItemForContext } =
      await import("../repositories/pgflex-logistics.repository");
    mockDocs.set("pgflex_events/dispatch-admin-1", {
      identifier: "ENV-ADMIN-001",
      shipmentType: "2pq",
      linked_codes: "ABC,DEF",
      origin: "Clinica Norte",
      destination:
        "Humboldt 2433 (PB 10), Palermo, Ciudad Autónoma de Buenos Aires, Argentina",
      dispatcherId: "driver-1",
      dispatcherFirebaseId: "driver-1",
      dispatcherEmail: "driver@example.com",
      status: "awaiting_pick_up",
      timeRequested: "2026-08-31T10:00:00.000Z",
      createdAt: "2026-08-31T10:00:00.000Z",
      updatedAt: "2026-08-31T10:00:00.000Z",
    });
    mockDocs.set("2pq_case/case-a", {
      caseLabel: "ABCXXX",
      three_letter_code: "ABC",
      caseStatus: "awaiting_pick_up",
      updatedAt: "2026-08-31T10:00:00.000Z",
    });
    mockDocs.set("2pq_case/case-b", {
      caseLabel: "DEFXXX",
      three_letter_code: "DEF",
      caseStatus: "awaiting_pick_up",
      updatedAt: "2026-08-31T10:00:00.000Z",
    });

    const updated = await updatePGFlexLogisticsItemForContext(
      fullAdminContext,
      "dispatch-admin-1",
      { status: "in_transit" },
    );

    expect(updated).toMatchObject({
      status: "in_transit",
      item_was_picked_date_at: "2026-08-31T15:45:00.000Z",
      canUpdate: true,
    });
    expect(mockDocs.get("pgflex_events/dispatch-admin-1")).toMatchObject({
      status: "in_transit",
      item_was_picked_date_at: "2026-08-31T15:45:00.000Z",
      updatedByEmail: "admin@example.com",
    });
    expect(mockDocs.get("2pq_case/case-a")).toMatchObject({
      caseStatus: "in_transit",
      last_updated_date: "2026-08-31T15:45:00.000Z",
      updatedAt: "2026-08-31T15:45:00.000Z",
      updatedByEmail: "admin@example.com",
    });
    expect(mockDocs.get("2pq_case/case-b")).toMatchObject({
      caseStatus: "in_transit",
      last_updated_date: "2026-08-31T15:45:00.000Z",
      updatedAt: "2026-08-31T15:45:00.000Z",
      updatedByEmail: "admin@example.com",
    });
  });

  it("lets an assigned transport dispatcher mark an in-transit dispatch as delivered", async () => {
    const { updatePGFlexLogisticsItemForContext } =
      await import("../repositories/pgflex-logistics.repository");
    mockDocs.set("pgflex_events/dispatch-2", {
      identifier: "ENV-002",
      shipmentType: "2pq",
      linked_codes: "ABC,DEF,GHI",
      origin: "Clinica Norte",
      destination:
        "Humboldt 2433 (PB 10), Palermo, Ciudad Autónoma de Buenos Aires, Argentina",
      dispatcherId: "driver-1",
      dispatcherFirebaseId: "driver-1",
      dispatcherEmail: "driver@example.com",
      status: "in_transit",
      item_was_picked_date_at: "2026-08-31T12:00:00.000Z",
      timeRequested: "2026-08-31T10:00:00.000Z",
      createdAt: "2026-08-31T10:00:00.000Z",
      updatedAt: "2026-08-31T12:00:00.000Z",
    });
    mockDocs.set("2pq_case/case-a", {
      caseLabel: "ABCXXX",
      three_letter_code: "ABC",
      caseStatus: "in_transit",
    });
    mockDocs.set("2pq_case/case-b", {
      caseLabel: "DEFXXX",
      three_letter_code: "DEF",
      caseStatus: "in_transit",
    });
    mockDocs.set("2pq_case/case-g", {
      caseLabel: "GHIXXX",
      three_letter_code: "GHI",
      caseStatus: "in_transit",
    });

    const updated = await updatePGFlexLogisticsItemForContext(
      transportDispatcherContext,
      "dispatch-2",
      { status: "arrived" },
    );

    expect(updated).toMatchObject({
      status: "arrived",
      item_was_picked_date_at: "2026-08-31T12:00:00.000Z",
      item_was_delivered_at: "2026-08-31T15:45:00.000Z",
      canUpdate: false,
    });
    expect(mockDocs.get("pgflex_events/dispatch-2")).toMatchObject({
      status: "arrived",
      item_was_picked_date_at: "2026-08-31T12:00:00.000Z",
      item_was_delivered_at: "2026-08-31T15:45:00.000Z",
      updatedByEmail: "driver@example.com",
    });
    expect(mockDocs.get("2pq_case/case-a")).toMatchObject({
      caseStatus: "samples_received",
      last_updated_date: "2026-08-31T15:45:00.000Z",
      updatedAt: "2026-08-31T15:45:00.000Z",
      updatedByEmail: "driver@example.com",
    });
    expect(mockDocs.get("2pq_case/case-b")).toMatchObject({
      caseStatus: "samples_received",
      last_updated_date: "2026-08-31T15:45:00.000Z",
      updatedAt: "2026-08-31T15:45:00.000Z",
      updatedByEmail: "driver@example.com",
    });
    expect(mockDocs.get("2pq_case/case-g")).toMatchObject({
      caseStatus: "samples_received",
      last_updated_date: "2026-08-31T15:45:00.000Z",
      updatedAt: "2026-08-31T15:45:00.000Z",
      updatedByEmail: "driver@example.com",
    });
  });

  it("lets a full admin use the operational delivery transition and sync linked 2PQ cases", async () => {
    const { updatePGFlexLogisticsItemForContext } =
      await import("../repositories/pgflex-logistics.repository");
    mockDocs.set("pgflex_events/dispatch-admin-2", {
      identifier: "ENV-ADMIN-002",
      shipmentType: "2pq",
      linked_codes: "ABC,DEF",
      origin: "Clinica Norte",
      destination:
        "Humboldt 2433 (PB 10), Palermo, Ciudad Autónoma de Buenos Aires, Argentina",
      dispatcherId: "driver-1",
      dispatcherFirebaseId: "driver-1",
      dispatcherEmail: "driver@example.com",
      status: "in_transit",
      item_was_picked_date_at: "2026-08-31T12:00:00.000Z",
      timeRequested: "2026-08-31T10:00:00.000Z",
      createdAt: "2026-08-31T10:00:00.000Z",
      updatedAt: "2026-08-31T12:00:00.000Z",
    });
    mockDocs.set("2pq_case/case-a", {
      caseLabel: "ABCXXX",
      three_letter_code: "ABC",
      caseStatus: "in_transit",
    });
    mockDocs.set("2pq_case/case-b", {
      caseLabel: "DEFXXX",
      three_letter_code: "DEF",
      caseStatus: "in_transit",
    });

    const updated = await updatePGFlexLogisticsItemForContext(
      fullAdminContext,
      "dispatch-admin-2",
      { status: "arrived" },
    );

    expect(updated).toMatchObject({
      status: "arrived",
      item_was_picked_date_at: "2026-08-31T12:00:00.000Z",
      item_was_delivered_at: "2026-08-31T15:45:00.000Z",
      canUpdate: true,
    });
    expect(mockDocs.get("pgflex_events/dispatch-admin-2")).toMatchObject({
      status: "arrived",
      item_was_picked_date_at: "2026-08-31T12:00:00.000Z",
      item_was_delivered_at: "2026-08-31T15:45:00.000Z",
      updatedByEmail: "admin@example.com",
    });
    expect(mockDocs.get("2pq_case/case-a")).toMatchObject({
      caseStatus: "samples_received",
      last_updated_date: "2026-08-31T15:45:00.000Z",
      updatedAt: "2026-08-31T15:45:00.000Z",
      updatedByEmail: "admin@example.com",
    });
    expect(mockDocs.get("2pq_case/case-b")).toMatchObject({
      caseStatus: "samples_received",
      last_updated_date: "2026-08-31T15:45:00.000Z",
      updatedAt: "2026-08-31T15:45:00.000Z",
      updatedByEmail: "admin@example.com",
    });
  });

  it("blocks transport dispatchers from arbitrary status changes", async () => {
    const { updatePGFlexLogisticsItemForContext } =
      await import("../repositories/pgflex-logistics.repository");
    mockDocs.set("pgflex_events/dispatch-3", {
      identifier: "ENV-003",
      origin: "Clinica Norte",
      destination:
        "Humboldt 2433 (PB 10), Palermo, Ciudad Autónoma de Buenos Aires, Argentina",
      dispatcherId: "driver-1",
      dispatcherFirebaseId: "driver-1",
      dispatcherEmail: "driver@example.com",
      status: "awaiting_pick_up",
      timeRequested: "2026-08-31T10:00:00.000Z",
      createdAt: "2026-08-31T10:00:00.000Z",
      updatedAt: "2026-08-31T10:00:00.000Z",
    });

    await expect(
      updatePGFlexLogisticsItemForContext(
        transportDispatcherContext,
        "dispatch-3",
        { status: "arrived" },
      ),
    ).rejects.toMatchObject({
      message:
        "Transport dispatchers can only move assigned items from awaiting pick up to in transit, or from in transit to arrived.",
      statusCode: 403,
    });
    expect(mockDocs.get("pgflex_events/dispatch-3")).toMatchObject({
      status: "awaiting_pick_up",
    });
  });
});
