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
  | { type: "limit"; count: number }
  | { type: "orderBy"; fieldPath: string; direction: "asc" | "desc" };
type MockQuery = {
  doc: (id: string) => MockDocumentRef;
  where: jest.Mock;
  orderBy: jest.Mock;
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
const mockSynchronizeTwoPQCasesFilesAndCodes = jest.fn();
const mockCascadeTwoPQCaseStatusToSamplingChildren = jest.fn();
const mockCreateTwoPQRecordForContext = jest.fn();

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
        ref,
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

      if (operation.operator === "in" && Array.isArray(operation.value)) {
        return operation.value.includes(value);
      }

      throw new Error(`Unsupported mock where operator: ${operation.operator}`);
    });
  }

  const orderOperation = operations.find(
    (
      operation,
    ): operation is Extract<MockQueryOperation, { type: "orderBy" }> =>
      operation.type === "orderBy",
  );
  if (orderOperation) {
    docs.sort((left, right) => {
      const comparison = String(
        left.data[orderOperation.fieldPath] ?? "",
      ).localeCompare(String(right.data[orderOperation.fieldPath] ?? ""));
      return orderOperation.direction === "asc" ? comparison : -comparison;
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
    ref: makeDocRef(collectionName, doc.id),
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
    orderBy: jest.fn(
      (fieldPath: string, direction: "asc" | "desc" = "asc"): MockQuery => {
        const operation: MockQueryOperation = {
          type: "orderBy",
          fieldPath,
          direction,
        };
        return makeQuery(collectionName, [...operations, operation]);
      },
    ),
    limit: jest.fn((count: number): MockQuery => {
      const operation: MockQueryOperation = { type: "limit", count };
      return makeQuery(collectionName, [...operations, operation]);
    }),
    get: jest.fn(async () => {
      const docs = applyQueryOperations(collectionName, operations);
      return { docs, size: docs.length, empty: docs.length === 0 };
    }),
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
          ref: MockDocumentRef;
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
  createTwoPQRecordForContext: mockCreateTwoPQRecordForContext,
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

jest.mock("../repositories/two-pq-auto-sync.repository.js", () => ({
  synchronizeTwoPQCasesFilesAndCodes: mockSynchronizeTwoPQCasesFilesAndCodes,
}));

jest.mock("../repositories/two-pq-sampling-status.repository.js", () => ({
  cascadeTwoPQCaseStatusToSamplingChildren:
    mockCascadeTwoPQCaseStatusToSamplingChildren,
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
    mockSynchronizeTwoPQCasesFilesAndCodes.mockClear();
    mockCascadeTwoPQCaseStatusToSamplingChildren.mockClear();
    mockCreateTwoPQRecordForContext.mockReset();

    mockDocs.set("admin_sequences/2pq_forms", { current: 40 });
    mockDocs.set("institutions/inst-1", {
      name: "Clinica Norte",
      code: "CN",
      address: "Av. Corrientes 123",
      city: "CABA",
      state: "Buenos Aires",
      country: "Argentina",
    });
    mockDocs.set("doctors/doctor-1", {
      institutionId: "inst-1",
      fullName: "Dra. Test",
      authEmail: "doctor@example.com",
      status: "active",
    });
    mockDocs.set("patients/patient-1", {
      institutionId: "inst-1",
      doctorId: "doctor-1",
      email: "patient@example.com",
      fullName: "Paciente Uno",
      status: "active",
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
      linkedStudyRequestFormId: "FORM-00031",
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
    mockDocs.set("2pq_forms/FORM-00031", {
      id: "FORM-00031",
      formType: "study_request",
      collectionKey: "2pq_forms",
      institutionId: "inst-1",
      doctorId: "doctor-1",
      linkedBiopsyForm: "FORM-00038",
      linkedWithdrawalRequest: null,
      patientInformation: {},
      requestedTest: {},
      createdAt: "2026-08-29T10:00:00.000Z",
      updatedAt: "2026-08-29T10:00:00.000Z",
    });
    mockDocs.set("2pq_forms/FORM-00032", {
      id: "FORM-00032",
      formType: "study_request",
      collectionKey: "2pq_forms",
      institutionId: "inst-1",
      doctorId: "doctor-1",
      linkedBiopsyForm: "FORM-00039",
      linkedWithdrawalRequest: null,
      patientInformation: {},
      requestedTest: {},
      createdAt: "2026-08-29T11:00:00.000Z",
      updatedAt: "2026-08-29T11:00:00.000Z",
    });
    mockDocs.set("2pq_forms/FORM-00038", {
      id: "FORM-00038",
      formType: "sample",
      collectionKey: "2pq_forms",
      institutionId: "inst-1",
      doctorId: "doctor-1",
      linkedCaseId: "case-a",
      linkedStudyRequestFormId: "FORM-00031",
      studyRequestForm: "FORM-00031",
      withdrawalRequest: null,
      patientInformation: {},
      requestedTest: {},
      createdAt: "2026-08-30T10:00:00.000Z",
      updatedAt: "2026-08-30T10:00:00.000Z",
    });
    mockDocs.set("2pq_forms/FORM-00039", {
      id: "FORM-00039",
      formType: "sample",
      collectionKey: "2pq_forms",
      institutionId: "inst-1",
      doctorId: "doctor-1",
      linkedCaseId: "case-b",
      linkedStudyRequestFormId: "FORM-00032",
      studyRequestForm: "FORM-00032",
      withdrawalRequest: null,
      patientInformation: {},
      requestedTest: {},
      createdAt: "2026-08-30T11:00:00.000Z",
      updatedAt: "2026-08-30T11:00:00.000Z",
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

  it("initializes both study-request backlink fields as null", async () => {
    const { createTwoPQFormForContext } =
      await import("../repositories/two-pq-forms.repository");

    const form = await createTwoPQFormForContext(fullAdminContext, {
      formType: "study_request",
      selectedPatientId: "patient-1",
      selectedInstitutionId: "inst-1",
      patientInformation: {
        institutionId: "inst-1",
        doctorId: "doctor-1",
        email: "patient@example.com",
        fullName: "Paciente Uno",
        status: "active",
      },
      medicalInformation: {
        spermGameteSource: "propio",
        oocyteGameteSource: "propio",
        maleFactor: false,
        previousMiscarriagesCount: "0",
      },
      previousGeneticTests: { karyotype: false },
      requestedTest: {
        pgtAFast: true,
        pgtAFastReportsMosaicism: false,
        pgtAFastReportsSex: false,
        pgtAStandard: false,
        pgtSr: false,
      },
    });

    expect(form).toMatchObject({
      id: "FORM-00041",
      linkedBiopsyForm: null,
      linkedWithdrawalRequest: null,
    });
    expect(mockDocs.get("2pq_forms/FORM-00041")).toMatchObject({
      linkedBiopsyForm: null,
      linkedWithdrawalRequest: null,
    });
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
        city: "Almagro",
        state: "Capital Federal",
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
      withdrawalCases: [
        expect.objectContaining({
          id: "case-a",
          reportCode: "ABCXXX",
          linkedStudyRequest: "FORM-00031",
          linkedBiopsyForm: "FORM-00038",
        }),
        expect.objectContaining({
          id: "case-b",
          reportCode: "DEFXXX",
          linkedStudyRequest: "FORM-00032",
          linkedBiopsyForm: "FORM-00039",
        }),
      ],
    });
    expect(mockDocs.get("2pq_case/case-a")).toMatchObject({
      caseStatus: "awaiting_pick_up",
      withdrawalFormId: "FORM-00041",
      withdrawalRequestedAt: "2026-08-31T15:45:00.000Z",
    });
    expect(mockDocs.get("2pq_forms/FORM-00031")).toMatchObject({
      linkedWithdrawalRequest: "FORM-00041",
    });
    expect(mockDocs.get("2pq_forms/FORM-00032")).toMatchObject({
      linkedWithdrawalRequest: "FORM-00041",
    });
    expect(mockDocs.get("2pq_forms/FORM-00038")).toMatchObject({
      studyRequestForm: "FORM-00031",
      withdrawalRequest: "FORM-00041",
    });
    expect(mockDocs.get("2pq_forms/FORM-00039")).toMatchObject({
      studyRequestForm: "FORM-00032",
      withdrawalRequest: "FORM-00041",
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
      origin:
        "Av. Corrientes 123, Almagro, Ciudad Autónoma de Buenos Aires, Argentina",
      destination:
        "Humboldt 2433 (PB 10), Palermo, Ciudad Autónoma de Buenos Aires, Argentina",
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
      "Humboldt 2433 (PB 10), Palermo, Ciudad Autónoma de Buenos Aires, Argentina",
    );
    expect(mockSynchronizeTwoPQCasesFilesAndCodes).toHaveBeenCalledWith(
      ["case-a", "case-b"],
      "admin@example.com",
    );
    expect(
      mockCascadeTwoPQCaseStatusToSamplingChildren,
    ).toHaveBeenNthCalledWith(1, {
      caseId: "case-a",
      previousCaseStatus: "processing",
      nextCaseStatus: "awaiting_pick_up",
      actorEmail: "admin@example.com",
    });
    expect(
      mockCascadeTwoPQCaseStatusToSamplingChildren,
    ).toHaveBeenNthCalledWith(2, {
      caseId: "case-b",
      previousCaseStatus: "processing",
      nextCaseStatus: "awaiting_pick_up",
      actorEmail: "admin@example.com",
    });
    expect(
      mockCascadeTwoPQCaseStatusToSamplingChildren.mock.invocationCallOrder[1]!,
    ).toBeLessThan(
      mockSynchronizeTwoPQCasesFilesAndCodes.mock.invocationCallOrder[0]!,
    );
    expect(mockSendPGFlexLogisticsAssignmentEmail).toHaveBeenCalledWith(
      {
        email: "alfa@example.com",
        displayName: "Alfa",
      },
      {
        id: "pgflex_withdrawal_form_00041",
        identifier: "Clinica Norte - 31-08-2026-03:45PM",
        origin:
          "Av. Corrientes 123, Almagro, Ciudad Autónoma de Buenos Aires, Argentina",
        destination:
          "Humboldt 2433 (PB 10), Palermo, Ciudad Autónoma de Buenos Aires, Argentina",
        timeRequested: "2026-08-31T15:45:00.000Z",
      },
    );
  });

  it("resolves per-code form links for an existing withdrawal detail", async () => {
    const { getTwoPQFormForContext } =
      await import("../repositories/two-pq-forms.repository");
    mockDocs.set("2pq_forms/FORM-00052", {
      id: "FORM-00052",
      formType: "withdrawal_request",
      collectionKey: "2pq_forms",
      institutionId: "inst-1",
      doctorId: "doctor-1",
      linkedCaseIds: ["case-a", "case-b"],
      withdrawalCases: [{ id: "case-a" }, { id: "case-b" }],
      patientInformation: {},
      requestedTest: {},
      createdAt: "2026-08-31T15:45:00.000Z",
      updatedAt: "2026-08-31T15:45:00.000Z",
    });

    const form = await getTwoPQFormForContext(fullAdminContext, "FORM-00052");

    expect(form.withdrawalCases).toEqual([
      expect.objectContaining({
        id: "case-a",
        reportCode: "ABCXXX",
        linkedStudyRequest: "FORM-00031",
        linkedBiopsyForm: "FORM-00038",
      }),
      expect.objectContaining({
        id: "case-b",
        reportCode: "DEFXXX",
        linkedStudyRequest: "FORM-00032",
        linkedBiopsyForm: "FORM-00039",
      }),
    ]);
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

  it("rejects a withdrawal when one linked study request already belongs to another withdrawal", async () => {
    const { createTwoPQFormForContext } =
      await import("../repositories/two-pq-forms.repository");
    mockDocs.set("2pq_forms/FORM-00031", {
      ...mockDocs.get("2pq_forms/FORM-00031"),
      linkedWithdrawalRequest: "FORM-00012",
    });

    await expect(
      createTwoPQFormForContext(fullAdminContext, {
        formType: "withdrawal_request",
        linkedCaseIds: ["case-a", "case-b"],
        institutionInformation: {
          name: "Clinica Norte",
          address: "Av. Corrientes 123",
          city: "CABA",
          state: "Buenos Aires",
          country: "Argentina",
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        "Study request form FORM-00031 is already linked to withdrawal request FORM-00012.",
    });
    expect(mockDocs.has("2pq_forms/FORM-00041")).toBe(false);
    expect(mockDocs.get("2pq_case/case-a")).toMatchObject({
      caseStatus: "processing",
    });
  });

  it("rejects a withdrawal when one linked biopsy already belongs to another withdrawal", async () => {
    const { createTwoPQFormForContext } =
      await import("../repositories/two-pq-forms.repository");
    mockDocs.set("2pq_forms/FORM-00038", {
      ...mockDocs.get("2pq_forms/FORM-00038"),
      withdrawalRequest: "FORM-00012",
    });

    await expect(
      createTwoPQFormForContext(fullAdminContext, {
        formType: "withdrawal_request",
        linkedCaseIds: ["case-a", "case-b"],
        institutionInformation: {
          name: "Clinica Norte",
          address: "Av. Corrientes 123",
          city: "CABA",
          state: "Buenos Aires",
          country: "Argentina",
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        "Biopsy form FORM-00038 is already linked to withdrawal request FORM-00012.",
    });
    expect(mockDocs.has("2pq_forms/FORM-00041")).toBe(false);
  });

  it("clears study-request and biopsy backlinks when the withdrawal form is deleted", async () => {
    const { deleteTwoPQFormForContext } =
      await import("../repositories/two-pq-forms.repository");
    mockDocs.set("2pq_forms/FORM-00041", {
      id: "FORM-00041",
      formType: "withdrawal_request",
      collectionKey: "2pq_forms",
      institutionId: "inst-1",
      doctorId: "doctor-1",
      linkedCaseIds: ["case-a", "case-b"],
      patientInformation: {},
      requestedTest: {},
      createdAt: "2026-08-31T15:45:00.000Z",
      updatedAt: "2026-08-31T15:45:00.000Z",
    });
    mockDocs.set("2pq_forms/FORM-00031", {
      ...mockDocs.get("2pq_forms/FORM-00031"),
      linkedWithdrawalRequest: "FORM-00041",
    });
    mockDocs.set("2pq_forms/FORM-00032", {
      ...mockDocs.get("2pq_forms/FORM-00032"),
      linkedWithdrawalRequest: "FORM-00041",
    });
    mockDocs.set("2pq_forms/FORM-00038", {
      ...mockDocs.get("2pq_forms/FORM-00038"),
      withdrawalRequest: "FORM-00041",
    });
    mockDocs.set("2pq_forms/FORM-00039", {
      ...mockDocs.get("2pq_forms/FORM-00039"),
      withdrawalRequest: "FORM-00041",
    });

    await expect(
      deleteTwoPQFormForContext(fullAdminContext, "FORM-00041"),
    ).resolves.toEqual({ deleted: true, formId: "FORM-00041" });
    expect(mockDocs.has("2pq_forms/FORM-00041")).toBe(false);
    expect(mockDocs.get("2pq_forms/FORM-00031")).toMatchObject({
      linkedWithdrawalRequest: null,
    });
    expect(mockDocs.get("2pq_forms/FORM-00032")).toMatchObject({
      linkedWithdrawalRequest: null,
    });
    expect(mockDocs.get("2pq_forms/FORM-00038")).toMatchObject({
      withdrawalRequest: null,
    });
    expect(mockDocs.get("2pq_forms/FORM-00039")).toMatchObject({
      withdrawalRequest: null,
    });
  });

  it("claims the study request when creating a biopsy form and rejects a second biopsy", async () => {
    const { createTwoPQFormForContext } =
      await import("../repositories/two-pq-forms.repository");

    mockDocs.set("2pq_forms/FORM-00040", {
      id: "FORM-00040",
      formType: "study_request",
      collectionKey: "2pq_forms",
      institutionId: "inst-1",
      doctorId: "doctor-1",
      selectedPatientId: "patient-1",
      selectedInstitutionId: "inst-1",
      patientName: "Paciente Uno",
      patientEmail: "patient@example.com",
      institutionName: "Clinica Norte",
      requestedTestName: "PGT-A FAST",
      linkedBiopsyForm: null,
      patientInformation: {
        patientId: "patient-1",
        institutionId: "inst-1",
        doctorId: "doctor-1",
        email: "patient@example.com",
        fullName: "Paciente Uno",
        status: "active" as const,
      },
      requestedTest: {
        pgtAFast: true,
        pgtAFastReportsMosaicism: false,
        pgtAFastReportsSex: false,
        pgtAStandard: false,
        pgtSr: false,
      },
      createdAt: "2026-08-30T10:00:00.000Z",
      updatedAt: "2026-08-30T10:00:00.000Z",
    });
    mockCreateTwoPQRecordForContext.mockImplementation(
      async (_context, area: string, input: MockDocData) =>
        area === "cases"
          ? {
              id: "case-created",
              ...input,
            }
          : {
              id: "sampling-created",
              ...input,
            },
    );

    const input = {
      formType: "sample" as const,
      linkedStudyRequestFormId: "FORM-00040",
      selectedPatientId: "patient-1",
      selectedInstitutionId: "inst-1",
      selectedRequestingDoctorId: "doctor-1",
      patientInformation: {
        institutionId: "inst-1",
        doctorId: "doctor-1",
        email: "patient@example.com",
        fullName: "Paciente Uno",
        status: "active" as const,
      },
      requestedTest: {
        pgtAFast: true,
        pgtAFastReportsMosaicism: false,
        pgtAFastReportsSex: false,
        pgtAStandard: false,
        pgtSr: false,
      },
      sampleInformation: {
        sampleType: "biopsia de trofoectodermo",
        processedByFirstName: "Ana",
        processedByLastName: "Lab",
        processDate: "2026-08-31",
        boxCode: "ABC",
        biopsyCount: "1",
      },
      caseInformation: {
        caseLabel: "ABCXXX",
        caseStatus: "entered",
      },
      samplingInformation: [
        {
          sampleId: "ABC001",
          sampleType: "biopsia de trofoectodermo",
          processingStatus: "awaiting_reception",
          embryoStageDay: "5",
          morphology: "AA",
          sentUl: "5",
          biopsiedCells: "6",
          cellsVisualized: true,
        },
      ],
    };

    const form = await createTwoPQFormForContext(fullAdminContext, input);

    expect(form.id).toBe("FORM-00041");
    expect(mockDocs.get("2pq_forms/FORM-00040")).toMatchObject({
      linkedBiopsyForm: "FORM-00041",
    });
    expect(mockDocs.get("2pq_forms/FORM-00041")).toMatchObject({
      formType: "sample",
      linkedStudyRequestFormId: "FORM-00040",
      studyRequestForm: "FORM-00040",
      withdrawalRequest: null,
    });

    await expect(
      createTwoPQFormForContext(fullAdminContext, input),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        "Study request form FORM-00040 is already linked to biopsy form FORM-00041.",
    });
    expect(mockCreateTwoPQRecordForContext).toHaveBeenCalledTimes(2);
  });

  it("atomically replaces and removes the single biopsy link", async () => {
    const { updateTwoPQStudyRequestBiopsyLinkForContext } =
      await import("../repositories/two-pq-forms.repository");

    const commonForm = {
      collectionKey: "2pq_forms",
      institutionId: "inst-1",
      doctorId: "doctor-1",
      selectedPatientId: "patient-1",
      patientName: "Paciente Uno",
      patientInformation: {
        patientId: "patient-1",
        institutionId: "inst-1",
        doctorId: "doctor-1",
      },
      requestedTest: { pgtAFast: true },
      createdAt: "2026-08-30T10:00:00.000Z",
      updatedAt: "2026-08-30T10:00:00.000Z",
    };
    mockDocs.set("2pq_forms/FORM-00040", {
      ...commonForm,
      id: "FORM-00040",
      formType: "study_request",
      linkedBiopsyForm: "FORM-00041",
    });
    mockDocs.set("2pq_forms/FORM-00041", {
      ...commonForm,
      id: "FORM-00041",
      formType: "sample",
      linkedStudyRequestFormId: "FORM-00040",
    });
    mockDocs.set("2pq_forms/FORM-00042", {
      ...commonForm,
      id: "FORM-00042",
      formType: "sample",
      linkedStudyRequestFormId: null,
    });

    const replaced = await updateTwoPQStudyRequestBiopsyLinkForContext(
      fullAdminContext,
      "FORM-00040",
      "FORM-00042",
    );

    expect(replaced.linkedBiopsyForm).toBe("FORM-00042");
    expect(mockDocs.get("2pq_forms/FORM-00041")).toMatchObject({
      linkedStudyRequestFormId: null,
      studyRequestForm: null,
    });
    expect(mockDocs.get("2pq_forms/FORM-00042")).toMatchObject({
      linkedStudyRequestFormId: "FORM-00040",
      studyRequestForm: "FORM-00040",
    });

    const removed = await updateTwoPQStudyRequestBiopsyLinkForContext(
      fullAdminContext,
      "FORM-00040",
      null,
    );

    expect(removed.linkedBiopsyForm).toBeNull();
    expect(mockDocs.get("2pq_forms/FORM-00040")).toMatchObject({
      linkedBiopsyForm: null,
    });
    expect(mockDocs.get("2pq_forms/FORM-00042")).toMatchObject({
      linkedStudyRequestFormId: null,
      studyRequestForm: null,
    });
  });

  it("lists only study requests that have no current or legacy biopsy link", async () => {
    const { listTwoPQFormsForContext } =
      await import("../repositories/two-pq-forms.repository");
    mockDocs.delete("2pq_forms/FORM-00038");
    mockDocs.delete("2pq_forms/FORM-00039");
    const baseStudyRequest = {
      formType: "study_request",
      collectionKey: "2pq_forms",
      institutionId: "inst-1",
      doctorId: "doctor-1",
      patientInformation: {},
      requestedTest: {},
      createdAt: "2026-08-30T10:00:00.000Z",
      updatedAt: "2026-08-30T10:00:00.000Z",
    };
    mockDocs.set("2pq_forms/FORM-00031", {
      ...baseStudyRequest,
      id: "FORM-00031",
      linkedBiopsyForm: null,
    });
    mockDocs.set("2pq_forms/FORM-00032", {
      ...baseStudyRequest,
      id: "FORM-00032",
      linkedBiopsyForm: "FORM-00041",
    });
    mockDocs.set("2pq_forms/FORM-00033", {
      ...baseStudyRequest,
      id: "FORM-00033",
    });
    mockDocs.set("2pq_forms/FORM-00034", {
      ...baseStudyRequest,
      id: "FORM-00034",
      linkedBiopsyForm: null,
    });
    mockDocs.set("2pq_forms/FORM-00043", {
      ...baseStudyRequest,
      id: "FORM-00043",
      formType: "sample",
      linkedStudyRequestFormId: "FORM-00033",
    });

    const result = await listTwoPQFormsForContext(fullAdminContext, {
      formType: "study_request",
      availableForBiopsy: true,
      limit: 20,
    });

    expect(result.forms.map((form) => form.id).sort()).toEqual([
      "FORM-00031",
      "FORM-00034",
    ]);
  });
});
