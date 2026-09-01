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
  | { type: "limit"; count: number };
type MockQuery = {
  doc: (id: string) => MockDocumentRef;
  where: jest.Mock;
  limit: jest.Mock;
  get: jest.Mock;
};

const mockDocs = new Map<string, MockDocData>();
const mockCollection = jest.fn((collectionName: string) =>
  makeQuery(collectionName),
);
const mockGetUser = jest.fn();
const mockGetUserByEmail = jest.fn();
const mockSendPGFlexLogisticsAssignmentEmail = jest.fn();

function docKey(ref: MockDocumentRef) {
  return `${ref.collectionName}/${ref.id}`;
}

function makeDocRef(collectionName: string, id: string): MockDocumentRef {
  const ref: MockDocumentRef = {
    id,
    collectionName,
    get: jest.fn(async () => {
      const data = mockDocs.get(docKey(ref));
      return {
        exists: Boolean(data),
        id,
        data: () => data,
      };
    }),
    set: jest.fn(async (data: MockDocData, options?: { merge?: boolean }) => {
      const current = mockDocs.get(docKey(ref)) ?? {};
      mockDocs.set(
        docKey(ref),
        options?.merge ? { ...current, ...data } : data,
      );
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

function applyQueryOperations(
  collectionName: string,
  operations: MockQueryOperation[],
) {
  let docs = docsIn(collectionName);

  for (const operation of operations) {
    if (operation.type !== "where") {
      continue;
    }

    docs = docs.filter((doc) => {
      const value = doc.data[operation.fieldPath];

      if (operation.operator === "==") {
        return value === operation.value;
      }

      throw new Error(`Unsupported mock where operator: ${operation.operator}`);
    });
  }

  const limitOperation = operations.find(
    (operation): operation is Extract<MockQueryOperation, { type: "limit" }> =>
      operation.type === "limit",
  );

  if (limitOperation) {
    docs = docs.slice(0, limitOperation.count);
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
    doc: (id: string) => makeDocRef(collectionName, id),
    where: jest.fn(
      (fieldPath: string, operator: string, value: unknown): MockQuery => {
        const operation: MockQueryOperation = {
          type: "where",
          fieldPath,
          operator,
          value,
        };
        return makeQuery(collectionName, [...operations, operation]);
      },
    ),
    limit: jest.fn((count: number): MockQuery => {
      const operation: MockQueryOperation = { type: "limit", count };
      return makeQuery(collectionName, [...operations, operation]);
    }),
    get: jest.fn(async () => ({
      docs: applyQueryOperations(collectionName, operations),
    })),
  };
}

const mockDb = {
  collection: mockCollection,
  batch: jest.fn(() => {
    const operations: Array<
      | {
          type: "set";
          ref: MockDocumentRef;
          data: MockDocData;
          options?: { merge?: boolean };
        }
      | { type: "delete"; ref: MockDocumentRef }
    > = [];

    return {
      set: jest.fn(
        (
          ref: MockDocumentRef,
          data: MockDocData,
          options?: { merge?: boolean },
        ) => {
          operations.push({ type: "set", ref, data, options });
        },
      ),
      delete: jest.fn((ref: MockDocumentRef) => {
        operations.push({ type: "delete", ref });
      }),
      commit: jest.fn(async () => {
        for (const operation of operations) {
          if (operation.type === "set") {
            const current = mockDocs.get(docKey(operation.ref)) ?? {};
            mockDocs.set(
              docKey(operation.ref),
              operation.options?.merge
                ? { ...current, ...operation.data }
                : operation.data,
            );
          } else {
            mockDocs.delete(docKey(operation.ref));
          }
        }
      }),
    };
  }),
  runTransaction: jest.fn(
    async (
      handler: (transaction: {
        get: (ref: MockDocumentRef) => Promise<{
          exists: boolean;
          id: string;
          data: () => MockDocData | undefined;
        }>;
        set: (
          ref: MockDocumentRef,
          data: MockDocData,
          options?: { merge?: boolean },
        ) => void;
      }) => Promise<string>,
    ) =>
      handler({
        get: (ref) => ref.get(),
        set: (ref, data, options) => {
          const current = mockDocs.get(docKey(ref)) ?? {};
          mockDocs.set(
            docKey(ref),
            options?.merge ? { ...current, ...data } : data,
          );
        },
      }),
  ),
};

jest.mock("../config/firebase.js", () => ({
  adminAuthFor: jest.fn(() => ({
    getUser: mockGetUser,
    getUserByEmail: mockGetUserByEmail,
  })),
  adminDbFor: jest.fn(() => mockDb),
}));

jest.mock("../repositories/areas.repository.js", () => ({
  createPatientForContext: jest.fn(),
  grantPatientPortalAccessForNewPatient: jest.fn(),
}));

jest.mock("../repositories/roles.repository.js", () => ({
  canCreatePatient: jest.fn(() => true),
  canViewDoctor: jest.fn(() => true),
  canViewInstitution: jest.fn(() => true),
  canViewPatient: jest.fn(() => true),
  normalizeRoleEmail: (email: string) => email.trim().toLowerCase(),
}));

jest.mock("../repositories/two-pq.repository.js", () => ({
  createTwoPQRecordForContext: jest.fn(),
  getTwoPQDetailForContext: jest.fn(),
}));

jest.mock("../lib/informed-consent-email.js", () => ({
  sendInformedConsentEmail: jest.fn(),
}));

jest.mock("../lib/patient-portal-credentials.js", () => ({
  shouldAutomaticallyGrantPatientPortalAccess: jest.fn(() => false),
}));

jest.mock("../lib/pgflex-dispatcher-email.js", () => ({
  sendPGFlexLogisticsAssignmentEmail: mockSendPGFlexLogisticsAssignmentEmail,
}));

const fullAdminContext = {
  email: " admin@example.com ",
  uid: "admin-uid",
  role: "full_admin" as const,
  isBootstrap: false,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  projectAccess: ["mydnamap" as const],
};

describe("2PQ withdrawal forms PGFlex automation", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-31T15:45:00.000Z"));
    mockDocs.clear();
    mockCollection.mockClear();
    mockDb.batch.mockClear();
    mockDb.runTransaction.mockClear();
    mockGetUser.mockReset();
    mockGetUserByEmail.mockReset();
    mockSendPGFlexLogisticsAssignmentEmail.mockReset();

    mockDocs.set("admin_sequences/2pq_forms", { current: 40 });
    mockDocs.set("institutions/inst-1", {
      name: "Clinica Norte",
      code: "CN",
      address: "Av. Corrientes 123",
      city: "CABA",
      state: "Buenos Aires",
      country: "Argentina",
    });
    mockDocs.set("2pq_case/case-a", {
      institutionId: "inst-1",
      doctorId: "doctor-1",
      patientId: "patient-1",
      three_letter_code: "abc",
      caseLabel: "Caso Alfa",
      caseStatus: "processing",
      caseType: "PGT-A",
      requestedAt: "2026-08-30T12:00:00.000Z",
      notes: "Primer caso",
    });
    mockDocs.set("2pq_case/case-b", {
      institutionId: "inst-1",
      doctorId: "doctor-1",
      patientId: "patient-2",
      three_letter_code: "DEF",
      caseLabel: "Caso Beta",
      caseStatus: "processing",
      caseType: "PGT-A",
      requestedAt: "2026-08-30T13:00:00.000Z",
    });
    mockDocs.set("user_roles/zeta@example.com", {
      email: "zeta@example.com",
      role: "transport_dispatcher",
      isActive: true,
      firebaseUid: "dispatcher-z",
      displayName: "Zeta",
      is_preferred_asignee: false,
      createdAt: "2026-08-31T14:30:00.000Z",
      updatedAt: "2026-08-31T14:30:00.000Z",
    });
    mockDocs.set("user_roles/alfa@example.com", {
      email: "alfa@example.com",
      role: "transport_dispatcher",
      isActive: true,
      firebaseUid: "dispatcher-a",
      displayName: "Alfa",
      is_preferred_asignee: true,
      createdAt: "2026-08-31T12:30:00.000Z",
      updatedAt: "2026-08-31T12:30:00.000Z",
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("creates a 2PQ PGFlex event with the fixed Humboldt destination when a withdrawal request form is stored", async () => {
    const { createTwoPQFormForContext } =
      await import("../repositories/two-pq-forms.repository");

    const form = await createTwoPQFormForContext(fullAdminContext, {
      formType: "withdrawal_request",
      linkedCaseIds: ["case-a", "case-b"],
      institutionInformation: {
        name: "Clinica Norte",
        address: "Av. Corrientes 123",
        city: "CABA",
        state: "Buenos Aires",
        country: "Argentina",
      },
    });

    const pgflexEvent = mockDocs.get(
      "pgflex_events/pgflex_withdrawal_form_00041",
    );

    expect(form.id).toBe("FORM-00041");
    expect(mockDocs.get("2pq_forms/FORM-00041")).toMatchObject({
      formType: "withdrawal_request",
      linkedCaseIds: ["case-a", "case-b"],
      institutionId: "inst-1",
    });
    expect(mockDocs.get("2pq_case/case-a")).toMatchObject({
      caseStatus: "awaiting_pick_up",
      withdrawalFormId: "FORM-00041",
      withdrawalRequestedAt: "2026-08-31T15:45:00.000Z",
    });
    expect(pgflexEvent).toMatchObject({
      identifier: "Clinica Norte - 31-08-2026-03:45PM",
      shipmentType: "2pq",
      description:
        "Formulario de solicitud de retiro: FORM-00041. Casos: Caso Alfa, Caso Beta. Codigos: ABC,DEF. Solicitado por: admin@example.com.",
      linked_codes: "ABC,DEF",
      dispatcherId: "dispatcher-a",
      dispatcherFirebaseId: "dispatcher-a",
      dispatcherEmail: "alfa@example.com",
      origin: "Av. Corrientes 123, CABA, Buenos Aires, Argentina",
      destination:
        "Humboldt 2433 (10 'C'), Palermo, Ciudad Autónoma de Buenos Aires, Argentina",
      timeRequested: "2026-08-31T15:45:00.000Z",
      pickupTime: null,
      status: "awaiting_pick_up",
      source: "2pq_withdrawal_request",
      sourceFormId: "FORM-00041",
      linkedCaseIds: ["case-a", "case-b"],
      createdByEmail: "admin@example.com",
      dispatcherNotificationEmailSentAt: "2026-08-31T15:45:00.000Z",
    });
    expect(pgflexEvent?.shipmentType).toBe("2pq");
    expect(pgflexEvent?.destination).toBe(
      "Humboldt 2433 (10 'C'), Palermo, Ciudad Autónoma de Buenos Aires, Argentina",
    );
    expect(mockSendPGFlexLogisticsAssignmentEmail).toHaveBeenCalledWith(
      {
        email: "alfa@example.com",
        displayName: "Alfa",
      },
      {
        id: "pgflex_withdrawal_form_00041",
        identifier: "Clinica Norte - 31-08-2026-03:45PM",
        origin: "Av. Corrientes 123, CABA, Buenos Aires, Argentina",
        destination:
          "Humboldt 2433 (10 'C'), Palermo, Ciudad Autónoma de Buenos Aires, Argentina",
        timeRequested: "2026-08-31T15:45:00.000Z",
      },
    );
  });

  it("falls back to the newest active dispatcher when no preferred dispatcher exists", async () => {
    const { createTwoPQFormForContext } =
      await import("../repositories/two-pq-forms.repository");

    mockDocs.set("user_roles/alfa@example.com", {
      ...mockDocs.get("user_roles/alfa@example.com"),
      is_preferred_asignee: false,
    });

    await createTwoPQFormForContext(fullAdminContext, {
      formType: "withdrawal_request",
      linkedCaseIds: ["case-a", "case-b"],
      institutionInformation: {
        name: "Clinica Norte",
        address: "Av. Corrientes 123",
        city: "CABA",
        state: "Buenos Aires",
        country: "Argentina",
      },
    });

    const pgflexEvent = mockDocs.get(
      "pgflex_events/pgflex_withdrawal_form_00041",
    );
    expect(pgflexEvent).toMatchObject({
      dispatcherId: "dispatcher-z",
      dispatcherFirebaseId: "dispatcher-z",
      dispatcherEmail: "zeta@example.com",
    });
    expect(mockSendPGFlexLogisticsAssignmentEmail).toHaveBeenCalledWith(
      {
        email: "zeta@example.com",
        displayName: "Zeta",
      },
      expect.objectContaining({
        id: "pgflex_withdrawal_form_00041",
      }),
    );
  });

  it("chooses the newest preferred dispatcher when more than one is marked preferred", async () => {
    const { createTwoPQFormForContext } =
      await import("../repositories/two-pq-forms.repository");

    mockDocs.set("user_roles/bravo@example.com", {
      email: "bravo@example.com",
      role: "transport_dispatcher",
      isActive: true,
      firebaseUid: "dispatcher-b",
      displayName: "Bravo",
      is_preferred_asignee: true,
      createdAt: "2026-08-31T14:00:00.000Z",
      updatedAt: "2026-08-31T14:00:00.000Z",
    });

    await createTwoPQFormForContext(fullAdminContext, {
      formType: "withdrawal_request",
      linkedCaseIds: ["case-a", "case-b"],
      institutionInformation: {
        name: "Clinica Norte",
        address: "Av. Corrientes 123",
        city: "CABA",
        state: "Buenos Aires",
        country: "Argentina",
      },
    });

    const pgflexEvent = mockDocs.get(
      "pgflex_events/pgflex_withdrawal_form_00041",
    );
    expect(pgflexEvent).toMatchObject({
      dispatcherId: "dispatcher-b",
      dispatcherFirebaseId: "dispatcher-b",
      dispatcherEmail: "bravo@example.com",
    });
  });
});
