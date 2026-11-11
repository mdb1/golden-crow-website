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
  | { type: "startAfter"; id: string }
  | { type: "orderBy"; fieldPath: string; direction: "asc" | "desc" };
type MockQuery = {
  doc: (id: string) => MockDocumentRef;
  where: jest.Mock;
  orderBy: jest.Mock;
  startAfter: jest.Mock;
  limit: jest.Mock;
  get: jest.Mock;
};

function mockFieldPathKey(fieldPath: unknown) {
  if (typeof fieldPath === "string") {
    return fieldPath;
  }
  if (
    fieldPath &&
    typeof fieldPath === "object" &&
    Array.isArray((fieldPath as { segments?: unknown }).segments)
  ) {
    return (fieldPath as { segments: string[] }).segments.join(".");
  }
  return String(fieldPath).replace(/^`|`$/g, "");
}

const mockDocs = new Map<string, MockDocData>();
const mockCollection = jest.fn((collectionName: string) =>
  makeQuery(collectionName),
);
const mockGetUser = jest.fn();
const mockGetUserByEmail = jest.fn();
const mockSendPGFlexLogisticsAssignmentEmail = jest.fn();
const mockSendTreatmentPickupEmail = jest.fn();
const mockSynchronizeTwoPQCasesFilesAndCodes = jest.fn();
const mockCascadeTwoPQCaseStatusToSamplingChildren = jest.fn();
const mockCreateTwoPQRecordForContext = jest.fn();
const mockSendStudyRequestConsentInvitation = jest.fn();

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

      if (operation.operator === "array-contains-any") {
        return (
          Array.isArray(operation.value) &&
          Array.isArray(value) &&
          operation.value.some((entry) => value.includes(entry))
        );
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

  const cursor = operations.find((operation) => operation.type === "startAfter");
  if (cursor) {
    const index = docs.findIndex((doc) => doc.id === cursor.id);
    docs = docs.slice(index + 1);
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
      (fieldPath: unknown, operator: string, value: unknown): MockQuery => {
        const operation: MockQueryOperation = {
          type: "where",
          fieldPath: mockFieldPathKey(fieldPath),
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
    startAfter: jest.fn((snapshot: { id: string }): MockQuery =>
      makeQuery(collectionName, [...operations, { type: "startAfter", id: snapshot.id }]),
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
  getAll: jest.fn((...refs: Array<MockDocumentRef | { fieldMask: string[] }>) =>
    Promise.all(refs.flatMap((ref) => "get" in ref ? [ref.get()] : [])),
  ),
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
        delete: (ref: MockDocumentRef) => void;
      }) => Promise<unknown>,
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
        delete: (ref) => { mockDocs.delete(docKey(ref)); },
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
  createPatientForTwoPQForm: jest.fn(),
  grantPatientPortalAccessForTwoPQForm: jest.fn(),
}));

jest.mock("../repositories/roles.repository.js", () => ({
  canCreatePatient: jest.fn((context: { role: string }) => context.role !== "institution_laboratory_staff"),
  canViewDoctor: jest.fn(() => true),
  canViewInstitution: jest.fn(() => true),
  canViewPatient: jest.fn(() => true),
  normalizeRoleEmail: (email: string) => email.trim().toLowerCase(),
}));

jest.mock("../repositories/two-pq.repository.js", () => ({
  createTwoPQRecordForContext: mockCreateTwoPQRecordForContext,
  getTwoPQDetailForContext: jest.fn(),
}));

jest.mock("../repositories/informed-consents.repository.js", () => ({
  sendStudyRequestConsentInvitationForContext: mockSendStudyRequestConsentInvitation,
}));

jest.mock("../lib/patient-portal-credentials.js", () => ({
  shouldAutomaticallyGrantPatientPortalAccess: jest.fn(() => false),
}));

jest.mock("../lib/pgflex-dispatcher-email.js", () => ({
  sendPGFlexLogisticsAssignmentEmail: mockSendPGFlexLogisticsAssignmentEmail,
  sendTreatmentPickupEmail: mockSendTreatmentPickupEmail,
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

const planningRequestId = "FORM-00040";
const treatmentStartInput = {
  formType: "treatment_start" as const,
  linkedStudyRequestFormId: planningRequestId,
  treatmentStart: {
    studyType: "pgtAFast" as const,
    treatmentDate: "2026-08-27",
    estimatedBiopsyDate: "2026-08-31",
    estimatedEmbryoCount: 5,
    pickupDate: "2026-08-31",
    pickupWindowStart: "09:00",
    pickupWindowEnd: "11:00",
    pickupOrigin: "Av. Corrientes 123, Almagro, Ciudad Autónoma de Buenos Aires, Argentina",
    notes: "  ",
  },
};

function seedPlanningRequest() {
  mockDocs.set(`2pq_forms/${planningRequestId}`, {
    id: planningRequestId,
    formType: "study_request",
    institutionId: "inst-1",
    doctorId: "doctor-1",
    selectedPatientId: "patient-1",
    patientName: "Paciente Uno",
    patientInformation: { patientId: "patient-1", fullName: "Paciente Uno" },
    requestedTest: { pgtAStandard: true },
    requiresTreatmentStart: true,
    linkedTreatmentStartFormId: null,
    createdAt: "2026-08-26T10:00:00.000Z",
    updatedAt: "2026-08-26T10:00:00.000Z",
  });
}

function seedRequestConsent(requestId: string, reviewStatus: "needs_review" | "ready" = "ready") {
  const consentId = `consent-${requestId}`;
  const key = `2pq_forms/${requestId}`;
  mockDocs.set(key, {
    ...mockDocs.get(key),
    selectedPatientId: "patient-1",
    informedConsentId: consentId,
  });
  mockDocs.set(`2pq-informed-consent/${consentId}`, {
    studyRequestFormId: requestId,
    patientId: "patient-1",
    institutionId: "inst-1",
    doctorId: "doctor-1",
    caseId: null,
    reviewStatus,
    file: { name: "consent.pdf", type: "application/pdf", size: 100 },
    ...(reviewStatus === "ready" ? {
      reviewedAt: "2026-08-31T12:00:00.000Z",
      reviewedByEmail: "admin@example.com",
    } : {}),
  });
  return consentId;
}

describe("2PQ form workflow and PGFlex automation", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-31T15:45:00.000Z"));
    mockDocs.clear();
    mockCollection.mockClear();
    mockDb.getAll.mockClear();
    mockDb.batch.mockClear();
    mockDb.runTransaction.mockClear();
    mockGetUser.mockReset();
    mockGetUserByEmail.mockReset();
    mockSendPGFlexLogisticsAssignmentEmail.mockReset();
    mockSendTreatmentPickupEmail.mockReset();
    mockSynchronizeTwoPQCasesFilesAndCodes.mockClear();
    mockCascadeTwoPQCaseStatusToSamplingChildren.mockClear();
    mockCreateTwoPQRecordForContext.mockReset();
    mockSendStudyRequestConsentInvitation.mockReset();

    mockDocs.set("admin_sequences/2pq_forms", { current: 40 });
    mockDocs.set("institutions/inst-1", {
      name: "Clinica Norte",
      code: "CN",
      address: "Av. Corrientes 123",
      city: "CABA",
      state: "Capital Federal",
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

  it("saves treatment planning and its draft without creating a case, and unlocks biopsy eligibility", async () => {
    const { createTwoPQFormForContext, listTwoPQFormsForContext, upsertTwoPQFormDraftForContext, getTwoPQFormForContext } =
      await import("../repositories/two-pq-forms.repository");
    seedPlanningRequest();

    expect((await listTwoPQFormsForContext(fullAdminContext, { availableForBiopsy: true })).forms).toHaveLength(0);
    expect((await listTwoPQFormsForContext(fullAdminContext, { availableForTreatmentStart: true })).forms.map(({ id }) => id))
      .toEqual([planningRequestId]);
    const draft = await upsertTwoPQFormDraftForContext(fullAdminContext, {
      formType: "treatment_start",
      currentStep: "preview",
      stepIndex: 3,
      state: {
        linkedStudyRequestFormId: planningRequestId,
        treatmentStart: { pickupDate: "", pickupDestination: "Ignored", notes: " " },
      },
    });
    const destination = "Humboldt 2433 (PB 10), Palermo, Ciudad Autónoma de Buenos Aires, Argentina";
    expect(draft).toMatchObject({
      formType: "treatment_start",
      currentStep: "preview",
      stepIndex: 3,
      state: { treatmentStart: { pickupDestination: destination, notes: "Sin observaciones" } },
    });

    const form = await createTwoPQFormForContext(fullAdminContext, treatmentStartInput);
    expect(form).toMatchObject({
      formType: "treatment_start",
      linkedStudyRequestFormId: planningRequestId,
      linkedCaseId: null,
      linkedBiopsyForm: null,
      treatmentStart: { ...treatmentStartInput.treatmentStart, pickupDestination: destination, notes: "Sin observaciones", temperatureC: 4 },
      pickup: { destination, status: "planned", expectedCaseCount: 1, readyCaseCount: 0 },
    });
    expect(mockDocs.get(`2pq_forms/${planningRequestId}`)).toMatchObject({
      linkedTreatmentStartFormId: form.id,
      transportEventId: form.transportEventId,
      requestedTest: { pgtAStandard: true },
    });
    expect(mockDocs.has("2pq-form-drafts/admin-uid")).toBe(false);
    expect(mockCreateTwoPQRecordForContext).not.toHaveBeenCalled();
    expect((await getTwoPQFormForContext(fullAdminContext, form.id)).linkedCaseId).toBeNull();
    expect((await listTwoPQFormsForContext(fullAdminContext, { availableForBiopsy: true })).forms).toHaveLength(0);
    seedRequestConsent(planningRequestId);
    expect((await listTwoPQFormsForContext(fullAdminContext, { availableForBiopsy: true })).forms).toMatchObject([
      { id: planningRequestId, treatmentStart: { studyType: "pgtAFast" } },
    ]);
    await expect(createTwoPQFormForContext(fullAdminContext, treatmentStartInput)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects incorrect planning dates, times, addresses, and doctor scope before writing a treatment form", async () => {
    const { createTwoPQFormForContext } = await import("../repositories/two-pq-forms.repository");
    seedPlanningRequest();
    for (const overrides of [
      { pickupDate: "2026-09-01" },
      { treatmentDate: "2026-08-31" },
      { estimatedEmbryoCount: 0 },
      { pickupWindowEnd: "08:00" },
      { pickupOrigin: "Av. Corrientes 123" },
      { pickupOrigin: "Av. Corrientes 123, Rosario, Santa Fe, Argentina" },
    ]) {
      await expect(createTwoPQFormForContext(fullAdminContext, {
        ...treatmentStartInput,
        treatmentStart: { ...treatmentStartInput.treatmentStart, ...overrides },
      })).rejects.toMatchObject({ statusCode: 400 });
    }
    await expect(createTwoPQFormForContext({
      ...fullAdminContext,
      role: "institution_doctor",
      institutionId: "inst-1",
      doctorId: "doctor-other",
    }, treatmentStartInput)).rejects.toMatchObject({ statusCode: 403 });
    expect(mockDocs.get(`2pq_forms/${planningRequestId}`)?.linkedTreatmentStartFormId).toBeNull();
    expect(docsIn("pgflex_events")).toHaveLength(0);
  });

  it("keeps the saved destination and unstructured origin on historical treatment forms", async () => {
    const { createTwoPQFormForContext, getTwoPQFormForContext } =
      await import("../repositories/two-pq-forms.repository");
    seedPlanningRequest();
    const form = await createTwoPQFormForContext(fullAdminContext, treatmentStartInput);
    const stored = mockDocs.get(`2pq_forms/${form.id}`)!;
    stored.treatmentStart = {
      ...form.treatmentStart,
      pickupOrigin: "Clínica Norte",
      pickupDestination: "Destino original",
    };
    expect((await getTwoPQFormForContext(fullAdminContext, form.id)).treatmentStart)
      .toMatchObject({ pickupOrigin: "Clínica Norte", pickupDestination: "Destino original" });
  });

  it("gates new biopsies on treatment planning and reconciles pickup with the saved biopsy date", async () => {
    const { createTwoPQFormForContext } = await import("../repositories/two-pq-forms.repository");
    seedPlanningRequest();
    const biopsy = {
      formType: "sample" as const,
      linkedStudyRequestFormId: planningRequestId,
      selectedPatientId: "patient-1",
      patientInformation: {
        institutionId: "inst-1", doctorId: "doctor-1", email: "patient@example.com", fullName: "Paciente Uno",
      },
      requestedTest: {
        pgtAFast: true, pgtAFastReportsMosaicism: false, pgtAFastReportsSex: false,
        pgtAStandard: false, pgtSr: false,
      },
      sampleInformation: {
        sampleType: "biopsia de trofoectodermo", processedByFirstName: "Ana", processedByLastName: "Lab",
        processDate: "2026-09-02", boxCode: "NEW", biopsyCount: "1",
      },
      caseInformation: { caseLabel: "NEWXXX", caseStatus: "intake" },
      samplingInformation: [{
        sampleId: "NEW-01", sampleType: "biopsia de trofoectodermo", processingStatus: "awaiting_reception",
        embryoStageDay: "5", morphology: "AA", biopsiedCells: "6", cellsVisualized: true,
      }],
    };
    await expect(createTwoPQFormForContext(fullAdminContext, biopsy)).rejects.toThrow(
      "Approve the informed consent for this study request before submitting the biopsy.",
    );
    seedRequestConsent(planningRequestId, "needs_review");
    await expect(createTwoPQFormForContext(fullAdminContext, biopsy)).rejects.toThrow(
      "Approve the informed consent for this study request before submitting the biopsy.",
    );
    const consentId = seedRequestConsent(planningRequestId);
    await expect(createTwoPQFormForContext(fullAdminContext, biopsy)).rejects.toThrow(
      "Save the treatment planning form before submitting the biopsy form.",
    );
    expect(mockCreateTwoPQRecordForContext).not.toHaveBeenCalled();

    const plan = await createTwoPQFormForContext(fullAdminContext, treatmentStartInput);
    mockCreateTwoPQRecordForContext.mockRejectedValueOnce(new Error("Case creation failed"));
    await expect(createTwoPQFormForContext(fullAdminContext, biopsy)).rejects.toThrow("Case creation failed");
    expect(mockDocs.get(`pgflex_events/${plan.transportEventId}`)).toMatchObject({
      status: "planned", pickupDate: "2026-08-31", readyCaseCount: 0,
    });
    expect(mockDocs.get(`2pq_forms/${planningRequestId}`)?.linkedBiopsyForm).toBeNull();

    mockCreateTwoPQRecordForContext.mockImplementation(async (_context, area, input) => {
      const record = { id: area === "cases" ? "case-planned" : "sample-planned", ...input };
      if (area === "cases") {
        mockDocs.set(`2pq_case/${record.id}`, { ...record, linkedStudyRequestFormId: planningRequestId });
      }
      return record;
    });
    const form = await createTwoPQFormForContext(fullAdminContext, biopsy);
    expect(form).toMatchObject({
      linkedTreatmentStartFormId: plan.id,
      linkedCaseId: "case-planned",
      transportEventId: plan.transportEventId,
      pickup: { status: "confirmed", readyCaseCount: 1, pickupDate: "2026-09-02" },
    });
    expect(mockDocs.get(`2pq_forms/${plan.id}`)).toMatchObject({
      linkedCaseId: "case-planned", linkedBiopsyForm: form.id,
      treatmentStart: { estimatedBiopsyDate: "2026-08-31", pickupDate: "2026-08-31" },
    });
    expect(mockDocs.get(`pgflex_events/${plan.transportEventId}`)).toMatchObject({
      pickupDate: "2026-09-02",
      members: { [plan.id]: { estimatedBiopsyDate: "2026-08-31", biopsyDate: "2026-09-02" } },
    });
    expect(mockDocs.get(`2pq_forms/${planningRequestId}`)).toMatchObject({
      linkedTreatmentStartFormId: plan.id, linkedBiopsyForm: form.id, "2pq_case": "case-planned",
    });
    expect(mockDocs.get("2pq_case/case-planned")).toMatchObject({
      linkedTreatmentStartFormId: plan.id, linkedBiopsyForm: form.id, caseStatus: "awaiting_pick_up",
      informedConsentId: consentId,
    });
    expect(mockDocs.get(`2pq-informed-consent/${consentId}`)).toMatchObject({
      studyRequestFormId: planningRequestId, caseId: "case-planned", reviewStatus: "ready",
    });
    expect(mockSendTreatmentPickupEmail.mock.calls.map(([kind]) => kind)).toEqual(["planned", "confirmed"]);
    expect(mockSendTreatmentPickupEmail).toHaveBeenLastCalledWith(
      "confirmed", expect.anything(), expect.objectContaining({ pickupDate: "2026-09-02" }),
    );
  });

  it("stores a civil treatment estimate without a results deadline and initializes relationship fields", async () => {
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
        estimatedTreatmentDate: "2026-11-25",
        pgtAFast: true,
        pgtAFastReportsMosaicism: false,
        pgtAFastReportsSex: false,
        pgtAStandard: false,
        pgtSr: false,
      },
    });

    expect(form).toMatchObject({
      id: "FORM-00041",
      requestedTestName: "Fast PGT (24-72hs)",
      estimatedTreatmentDate: "2026-11-25",
      linkedBiopsyForm: null,
      linkedWithdrawalRequest: null,
      "2pq_case": null,
    });
    expect(mockDocs.get("2pq_forms/FORM-00041")).toMatchObject({
      requestedTest: {
        pgtAFast: true,
        testName: "Fast PGT (24-72hs)",
        requestDate: "2026-08-31T15:45:00.000Z",
        estimatedTreatmentDate: "2026-11-25",
      },
      estimatedTreatmentDate: "2026-11-25",
      linkedBiopsyForm: null,
      linkedWithdrawalRequest: null,
      "2pq_case": null,
    });
    expect(mockDocs.get("2pq_forms/FORM-00041")).not.toHaveProperty("maximumResultDeliveryAt");
    expect(mockDocs.get("2pq_forms/FORM-00041")).not.toHaveProperty("requestedTest.maximumResultDeliveryAt");
    expect(form.consent).toEqual({ id: null, status: "pending" });
    expect(mockSendStudyRequestConsentInvitation).toHaveBeenCalledWith(fullAdminContext, form.id);
  });

  it("keeps the selected Ultra-fast study and keeps karyotype disabled", async () => {
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
        pgtAUltraFast: true,
        pgtAUltraFastReportsMosaicism: true,
        pgtAUltraFastReportsSex: false,
        pgtAFast: false,
        pgtAStandard: false,
        pgtSr: false,
      },
    });

    expect(form).toMatchObject({
      requestedTestName: "Ultra-fast PGT (<8hs)",
      requestedTest: {
        pgtAUltraFast: true,
        pgtAUltraFastReportsMosaicism: true,
        pgtAUltraFastReportsSex: false,
      },
      previousGeneticTests: { karyotype: false },
    });
  });

  it("rejects karyotype attachments unless PGT SR is selected", async () => {
    const { createTwoPQFormForContext } =
      await import("../repositories/two-pq-forms.repository");

    await expect(
      createTwoPQFormForContext(fullAdminContext, {
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
        previousGeneticTests: {
          karyotype: true,
          karyotypeFileName: "cariotipo.pdf",
          karyotypeFileContent: "data:application/pdf;base64,AA==",
        },
        requestedTest: {
          pgtAUltraFast: false,
          pgtAFast: true,
          pgtAFastReportsMosaicism: false,
          pgtAFastReportsSex: false,
          pgtAStandard: false,
          pgtSr: false,
        },
      }),
    ).rejects.toMatchObject({
      message:
        "Karyotype information can only be attached when PGT-SR is selected.",
      statusCode: 400,
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

  it("links every affected study and biopsy when 2pq_case is the available case relationship", async () => {
    const { createTwoPQFormForContext } =
      await import("../repositories/two-pq-forms.repository");
    mockDocs.set("2pq_case/case-a", {
      ...mockDocs.get("2pq_case/case-a"),
      linkedStudyRequestFormId: null,
    });
    mockDocs.set("2pq_forms/FORM-00031", {
      ...mockDocs.get("2pq_forms/FORM-00031"),
      "2pq_case": "case-a",
    });
    mockDocs.set("2pq_forms/FORM-00038", {
      ...mockDocs.get("2pq_forms/FORM-00038"),
      linkedCaseId: null,
      selectedCaseId: null,
    });

    await createTwoPQFormForContext(fullAdminContext, {
      formType: "withdrawal_request",
      linkedCaseIds: ["case-a"],
      institutionInformation: {
        name: "Clinica Norte",
        address: "Av. Corrientes 123",
        city: "Almagro",
        state: "Capital Federal",
        country: "Argentina",
      },
    });

    expect(mockDocs.get("2pq_forms/FORM-00031")).toMatchObject({
      linkedWithdrawalRequest: "FORM-00041",
    });
    expect(mockDocs.get("2pq_forms/FORM-00038")).toMatchObject({
      studyRequestForm: "FORM-00031",
      linkedStudyRequestFormId: "FORM-00031",
      withdrawalRequest: "FORM-00041",
    });
    expect(mockDocs.get("2pq_forms/FORM-00032")).toMatchObject({
      linkedWithdrawalRequest: null,
    });
    expect(mockDocs.get("2pq_forms/FORM-00039")).toMatchObject({
      withdrawalRequest: null,
    });
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
        state: "Capital Federal",
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
        state: "Capital Federal",
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
          state: "Capital Federal",
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
          state: "Capital Federal",
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

  it("retains the study request and its signed consent when a hard delete is requested", async () => {
    const { deleteTwoPQFormForContext } = await import("../repositories/two-pq-forms.repository");
    const requestId = "FORM-00031";
    const consentId = seedRequestConsent(requestId, "needs_review");

    await expect(deleteTwoPQFormForContext(fullAdminContext, requestId)).rejects.toMatchObject({ statusCode: 409 });
    expect(mockDocs.get(`2pq_forms/${requestId}`)).toMatchObject({ informedConsentId: consentId });
    expect(mockDocs.get(`2pq-informed-consent/${consentId}`)).toMatchObject({ studyRequestFormId: requestId });
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

  it("lets laboratory staff submit a scoped biopsy and prevents a second biopsy", async () => {
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
        requestDate: "2026-08-30T10:00:00.000Z",
        maximumResultDeliveryAt: "2026-09-02T10:00:00.000Z",
      },
      maximumResultDeliveryAt: "2026-09-02T10:00:00.000Z",
      createdAt: "2026-08-30T10:00:00.000Z",
      updatedAt: "2026-08-30T10:00:00.000Z",
    });
    seedRequestConsent("FORM-00040");
    mockCreateTwoPQRecordForContext.mockImplementation(
      async (_context, area: string, input: MockDocData) => {
        const record = { id: area === "cases" ? "case-created" : "sampling-created", ...input };
        if (area === "cases") mockDocs.set("2pq_case/case-created", record);
        return record;
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
        dueAt: "2099-01-01",
      },
      samplingInformation: [
        {
          sampleId: "ABC001",
          sampleType: "biopsia de trofoectodermo",
          processingStatus: "awaiting_reception",
          embryoStageDay: "5",
          morphology: "AA / 5BB (+) — revisión",
          biopsiedCells: "6",
          cellsVisualized: true,
        },
      ],
    };

    const laboratoryContext = {
      ...fullAdminContext,
      role: "institution_laboratory_staff" as const,
      institutionId: "inst-1",
    };
    await expect(createTwoPQFormForContext(laboratoryContext, {
      ...input,
      patientInformation: { ...input.patientInformation, institutionId: "inst-other" },
    })).rejects.toMatchObject({ statusCode: 403 });

    const form = await createTwoPQFormForContext(laboratoryContext, input);

    expect(form.id).toBe("FORM-00041");
    expect(mockDocs.get("2pq_forms/FORM-00040")).toMatchObject({
      linkedBiopsyForm: "FORM-00041",
      "2pq_case": "case-created",
    });
    expect(mockDocs.get("2pq_forms/FORM-00041")).toMatchObject({
      formType: "sample",
      linkedStudyRequestFormId: "FORM-00040",
      studyRequestForm: "FORM-00040",
      withdrawalRequest: null,
      samplingInformation: [expect.objectContaining({ sampleId: "ABC-01", morphology: "AA / 5BB (+) — revisión" })],
    });
    expect(mockDocs.get("2pq_forms/FORM-00041")).not.toHaveProperty("maximumResultDeliveryAt");
    expect(mockDocs.get("2pq_forms/FORM-00041")).not.toHaveProperty("samplingInformation.0.sentUl");
    expect(mockCreateTwoPQRecordForContext).toHaveBeenCalledWith(
      laboratoryContext,
      "cases",
      expect.objectContaining({ dueAt: "2099-01-01T00:00:00.000Z" }),
      expect.anything(),
    );

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

  it("atomically replaces and removes the single 2PQ case link", async () => {
    const {
      listTwoPQStudyRequestCaseCandidatesForContext,
      updateTwoPQStudyRequestCaseLinkForContext,
    } = await import("../repositories/two-pq-forms.repository");
    mockDocs.set("2pq_forms/FORM-00031", {
      ...mockDocs.get("2pq_forms/FORM-00031"),
      selectedPatientId: "patient-1",
      "2pq_case": "case-a",
    });
    mockDocs.set("2pq_case/case-c", {
      institutionId: "inst-1",
      doctorId: "doctor-1",
      patientId: "patient-1",
      three_letter_code: "ghi",
      caseLabel: "Caso Gamma",
      caseStatus: "entered",
      caseType: "PGT-A",
      priority: "normal",
      linkedStudyRequestFormId: null,
      createdAt: "2026-08-31T14:00:00.000Z",
      updatedAt: "2026-08-31T14:00:00.000Z",
    });

    const candidates = await listTwoPQStudyRequestCaseCandidatesForContext(
      fullAdminContext,
      "FORM-00031",
      "Gamma",
    );
    expect(candidates).toEqual([
      expect.objectContaining({
        id: "case-c",
        three_letter_code: "GHI",
        caseLabel: "Caso Gamma",
      }),
    ]);

    const replaced = await updateTwoPQStudyRequestCaseLinkForContext(
      fullAdminContext,
      "FORM-00031",
      "case-c",
    );

    expect(replaced["2pq_case"]).toBe("case-c");
    expect(mockDocs.get("2pq_case/case-a")).toMatchObject({
      linkedStudyRequestFormId: null,
    });
    expect(mockDocs.get("2pq_case/case-c")).toMatchObject({
      linkedStudyRequestFormId: "FORM-00031",
    });

    const removed = await updateTwoPQStudyRequestCaseLinkForContext(
      fullAdminContext,
      "FORM-00031",
      null,
    );

    expect(removed["2pq_case"]).toBeNull();
    expect(mockDocs.get("2pq_forms/FORM-00031")).toMatchObject({
      "2pq_case": null,
    });
    expect(mockDocs.get("2pq_case/case-c")).toMatchObject({
      linkedStudyRequestFormId: null,
    });
  });

  it("keeps a reverse-only biopsy link as a suggestion until it is repaired", async () => {
    const {
      getTwoPQFormForContext,
      updateTwoPQStudyRequestBiopsyLinkForContext,
    } = await import("../repositories/two-pq-forms.repository");
    mockDocs.set("2pq_forms/FORM-00031", {
      ...mockDocs.get("2pq_forms/FORM-00031"),
      linkedBiopsyForm: null,
    });

    const mismatched = await getTwoPQFormForContext(
      fullAdminContext,
      "FORM-00031",
    );

    expect(mismatched).toMatchObject({
      linkedBiopsyForm: null,
      suggestedBiopsyForm: "FORM-00038",
      biopsyLinkState: "missing_study_property",
    });

    const repaired = await updateTwoPQStudyRequestBiopsyLinkForContext(
      fullAdminContext,
      "FORM-00031",
      "FORM-00038",
    );

    expect(repaired).toMatchObject({
      linkedBiopsyForm: "FORM-00038",
      suggestedBiopsyForm: null,
      biopsyLinkState: "cohesive",
    });
    expect(mockDocs.get("2pq_forms/FORM-00031")).toMatchObject({
      linkedBiopsyForm: "FORM-00038",
    });
    expect(mockDocs.get("2pq_forms/FORM-00038")).toMatchObject({
      linkedStudyRequestFormId: "FORM-00031",
      studyRequestForm: "FORM-00031",
    });
  });

  it("detects and repairs a biopsy form that is missing its backlink", async () => {
    const {
      getTwoPQFormForContext,
      updateTwoPQStudyRequestBiopsyLinkForContext,
    } = await import("../repositories/two-pq-forms.repository");
    mockDocs.set("2pq_forms/FORM-00038", {
      ...mockDocs.get("2pq_forms/FORM-00038"),
      linkedStudyRequestFormId: null,
      studyRequestForm: null,
    });

    const mismatched = await getTwoPQFormForContext(
      fullAdminContext,
      "FORM-00031",
    );
    expect(mismatched).toMatchObject({
      linkedBiopsyForm: "FORM-00038",
      suggestedBiopsyForm: null,
      biopsyLinkState: "missing_biopsy_backlink",
    });

    const repaired = await updateTwoPQStudyRequestBiopsyLinkForContext(
      fullAdminContext,
      "FORM-00031",
      "FORM-00038",
    );
    expect(repaired.biopsyLinkState).toBe("cohesive");
    expect(mockDocs.get("2pq_forms/FORM-00038")).toMatchObject({
      linkedStudyRequestFormId: "FORM-00031",
      studyRequestForm: "FORM-00031",
    });
  });

  it("repairs and removes the study, biopsy, and withdrawal-case links together", async () => {
    const {
      getTwoPQFormForContext,
      updateTwoPQStudyRequestWithdrawalLinkForContext,
    } = await import("../repositories/two-pq-forms.repository");
    mockDocs.set("2pq_forms/FORM-00038", {
      ...mockDocs.get("2pq_forms/FORM-00038"),
      withdrawalRequest: "FORM-00052",
    });
    mockDocs.set("2pq_forms/FORM-00052", {
      id: "FORM-00052",
      formType: "withdrawal_request",
      collectionKey: "2pq_forms",
      institutionId: "inst-1",
      doctorId: "doctor-1",
      linkedCaseIds: ["case-a", "case-b"],
      withdrawalCases: [
        {
          id: "case-a",
          linkedStudyRequest: "FORM-00031",
          linkedBiopsyForm: "FORM-00038",
        },
        {
          id: "case-b",
          linkedStudyRequest: "FORM-00032",
          linkedBiopsyForm: "FORM-00039",
        },
      ],
      patientInformation: {},
      requestedTest: {},
      createdAt: "2026-08-31T15:45:00.000Z",
      updatedAt: "2026-08-31T15:45:00.000Z",
    });

    const mismatched = await getTwoPQFormForContext(
      fullAdminContext,
      "FORM-00031",
    );
    expect(mismatched).toMatchObject({
      linkedWithdrawalRequest: null,
      suggestedWithdrawalRequest: "FORM-00052",
      withdrawalLinkState: "missing_study_property",
    });

    const repaired = await updateTwoPQStudyRequestWithdrawalLinkForContext(
      fullAdminContext,
      "FORM-00031",
      "FORM-00052",
    );
    expect(repaired).toMatchObject({
      linkedWithdrawalRequest: "FORM-00052",
      suggestedWithdrawalRequest: null,
      withdrawalLinkState: "cohesive",
    });
    expect(mockDocs.get("2pq_forms/FORM-00038")).toMatchObject({
      withdrawalRequest: "FORM-00052",
    });
    expect(mockDocs.get("2pq_forms/FORM-00052")).toMatchObject({
      withdrawalCases: [
        expect.objectContaining({
          id: "case-a",
          linkedStudyRequest: "FORM-00031",
          linkedBiopsyForm: "FORM-00038",
        }),
        expect.objectContaining({
          id: "case-b",
          linkedStudyRequest: "FORM-00032",
          linkedBiopsyForm: "FORM-00039",
        }),
      ],
    });

    const unlinked = await updateTwoPQStudyRequestWithdrawalLinkForContext(
      fullAdminContext,
      "FORM-00031",
      null,
    );
    expect(unlinked).toMatchObject({
      linkedWithdrawalRequest: null,
      suggestedWithdrawalRequest: null,
      withdrawalLinkState: "none",
    });
    expect(mockDocs.get("2pq_forms/FORM-00038")).toMatchObject({
      withdrawalRequest: null,
    });
    expect(mockDocs.get("2pq_forms/FORM-00052")).toMatchObject({
      withdrawalCases: [
        expect.objectContaining({
          id: "case-a",
          linkedStudyRequest: null,
          linkedBiopsyForm: null,
        }),
        expect.objectContaining({
          id: "case-b",
          linkedStudyRequest: "FORM-00032",
          linkedBiopsyForm: "FORM-00039",
        }),
      ],
    });
    const withdrawalDetail = await getTwoPQFormForContext(
      fullAdminContext,
      "FORM-00052",
    );
    expect(withdrawalDetail.withdrawalCases).toEqual([
      expect.objectContaining({
        id: "case-a",
        linkedStudyRequest: null,
        linkedBiopsyForm: null,
      }),
      expect.objectContaining({
        id: "case-b",
        linkedStudyRequest: "FORM-00032",
        linkedBiopsyForm: "FORM-00039",
      }),
    ]);
  });

  it("repairs a withdrawal request cell that is missing its backlink", async () => {
    const {
      getTwoPQFormForContext,
      updateTwoPQStudyRequestWithdrawalLinkForContext,
    } = await import("../repositories/two-pq-forms.repository");
    mockDocs.set("2pq_forms/FORM-00031", {
      ...mockDocs.get("2pq_forms/FORM-00031"),
      linkedWithdrawalRequest: "FORM-00052",
    });
    mockDocs.set("2pq_forms/FORM-00038", {
      ...mockDocs.get("2pq_forms/FORM-00038"),
      withdrawalRequest: null,
    });
    mockDocs.set("2pq_forms/FORM-00052", {
      id: "FORM-00052",
      formType: "withdrawal_request",
      collectionKey: "2pq_forms",
      institutionId: "inst-1",
      doctorId: "doctor-1",
      linkedCaseIds: ["case-a"],
      withdrawalCases: [{ id: "case-a" }],
      patientInformation: {},
      requestedTest: {},
      createdAt: "2026-08-31T15:45:00.000Z",
      updatedAt: "2026-08-31T15:45:00.000Z",
    });

    const mismatched = await getTwoPQFormForContext(
      fullAdminContext,
      "FORM-00031",
    );
    expect(mismatched.withdrawalLinkState).toBe("missing_withdrawal_backlink");

    const repaired = await updateTwoPQStudyRequestWithdrawalLinkForContext(
      fullAdminContext,
      "FORM-00031",
      "FORM-00052",
    );
    expect(repaired.withdrawalLinkState).toBe("cohesive");
    expect(mockDocs.get("2pq_forms/FORM-00038")).toMatchObject({
      withdrawalRequest: "FORM-00052",
    });
    expect(mockDocs.get("2pq_forms/FORM-00052")).toMatchObject({
      withdrawalCases: [
        expect.objectContaining({
          linkedStudyRequest: "FORM-00031",
          linkedBiopsyForm: "FORM-00038",
        }),
      ],
    });
  });

  it("repairs and removes a biopsy form study-request link from the biopsy side", async () => {
    const {
      getTwoPQFormForContext,
      updateTwoPQBiopsyStudyRequestLinkForContext,
    } = await import("../repositories/two-pq-forms.repository");
    mockDocs.set("2pq_forms/FORM-00038", {
      ...mockDocs.get("2pq_forms/FORM-00038"),
      linkedStudyRequestFormId: null,
      studyRequestForm: null,
    });

    const mismatched = await getTwoPQFormForContext(
      fullAdminContext,
      "FORM-00038",
    );
    expect(mismatched).toMatchObject({
      studyRequestForm: null,
      suggestedStudyRequestForm: "FORM-00031",
      studyRequestLinkState: "missing_biopsy_property",
    });

    const repaired = await updateTwoPQBiopsyStudyRequestLinkForContext(
      fullAdminContext,
      "FORM-00038",
      "FORM-00031",
    );
    expect(repaired).toMatchObject({
      studyRequestForm: "FORM-00031",
      linkedStudyRequestFormId: "FORM-00031",
      suggestedStudyRequestForm: null,
      studyRequestLinkState: "cohesive",
    });
    expect(mockDocs.get("2pq_forms/FORM-00031")).toMatchObject({
      linkedBiopsyForm: "FORM-00038",
    });

    const unlinked = await updateTwoPQBiopsyStudyRequestLinkForContext(
      fullAdminContext,
      "FORM-00038",
      null,
    );
    expect(unlinked).toMatchObject({
      studyRequestForm: null,
      linkedStudyRequestFormId: null,
      suggestedStudyRequestForm: null,
      studyRequestLinkState: "none",
    });
    expect(mockDocs.get("2pq_forms/FORM-00031")).toMatchObject({
      linkedBiopsyForm: null,
    });
  });

  it("repairs and removes withdrawal links from the biopsy side without touching sibling cells", async () => {
    const {
      getTwoPQFormForContext,
      updateTwoPQBiopsyWithdrawalLinkForContext,
    } = await import("../repositories/two-pq-forms.repository");
    mockDocs.set("2pq_forms/FORM-00031", {
      ...mockDocs.get("2pq_forms/FORM-00031"),
      linkedWithdrawalRequest: "FORM-00052",
    });
    mockDocs.set("2pq_forms/FORM-00038", {
      ...mockDocs.get("2pq_forms/FORM-00038"),
      withdrawalRequest: null,
    });
    mockDocs.set("2pq_forms/FORM-00052", {
      id: "FORM-00052",
      formType: "withdrawal_request",
      collectionKey: "2pq_forms",
      institutionId: "inst-1",
      doctorId: "doctor-1",
      linkedCaseIds: ["case-a", "case-b"],
      withdrawalCases: [
        {
          id: "case-a",
          linkedStudyRequest: "FORM-00031",
          linkedBiopsyForm: "FORM-00038",
        },
        {
          id: "case-b",
          linkedStudyRequest: "FORM-00032",
          linkedBiopsyForm: "FORM-00039",
        },
      ],
      patientInformation: {},
      requestedTest: {},
      createdAt: "2026-08-31T15:45:00.000Z",
      updatedAt: "2026-08-31T15:45:00.000Z",
    });

    const mismatched = await getTwoPQFormForContext(
      fullAdminContext,
      "FORM-00038",
    );
    expect(mismatched).toMatchObject({
      withdrawalRequest: null,
      suggestedWithdrawalRequest: "FORM-00052",
      withdrawalLinkState: "missing_biopsy_backlink",
    });

    const repaired = await updateTwoPQBiopsyWithdrawalLinkForContext(
      fullAdminContext,
      "FORM-00038",
      "FORM-00052",
    );
    expect(repaired).toMatchObject({
      withdrawalRequest: "FORM-00052",
      suggestedWithdrawalRequest: null,
      withdrawalLinkState: "cohesive",
    });

    const unlinked = await updateTwoPQBiopsyWithdrawalLinkForContext(
      fullAdminContext,
      "FORM-00038",
      null,
    );
    expect(unlinked).toMatchObject({
      withdrawalRequest: null,
      suggestedWithdrawalRequest: null,
      withdrawalLinkState: "none",
    });
    expect(mockDocs.get("2pq_forms/FORM-00031")).toMatchObject({
      linkedWithdrawalRequest: null,
    });
    expect(mockDocs.get("2pq_forms/FORM-00052")).toMatchObject({
      withdrawalCases: [
        expect.objectContaining({
          id: "case-a",
          linkedStudyRequest: null,
          linkedBiopsyForm: null,
        }),
        expect.objectContaining({
          id: "case-b",
          linkedStudyRequest: "FORM-00032",
          linkedBiopsyForm: "FORM-00039",
        }),
      ],
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
    for (const requestId of ["FORM-00031", "FORM-00032", "FORM-00033", "FORM-00034"]) {
      seedRequestConsent(requestId);
    }
    mockDocs.set("2pq_forms/FORM-00035", { ...baseStudyRequest, id: "FORM-00035" });
    seedRequestConsent("FORM-00035", "needs_review");
    mockDocs.set("2pq_forms/FORM-00036", {
      ...baseStudyRequest,
      id: "FORM-00036",
      selectedPatientId: "patient-1",
      informedConsentId: "consent-FORM-00034",
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

  it("resolves linked case labels for each paginated study-request form", async () => {
    const { listTwoPQFormsForContext } =
      await import("../repositories/two-pq-forms.repository");
    mockDocs.set("2pq_forms/FORM-00031", {
      ...mockDocs.get("2pq_forms/FORM-00031"),
      "2pq_case": "case-a",
    });
    mockDocs.set("2pq_case/case-a", {
      ...mockDocs.get("2pq_case/case-a"),
      caseLabel: "KIMXXX",
    });

    const result = await listTwoPQFormsForContext(fullAdminContext, {
      formType: "study_request",
      limit: 20,
    });

    expect(
      result.forms.find((form) => form.id === "FORM-00031"),
    ).toMatchObject({
      "2pq_case": "case-a",
      linkedCaseLabel: "KIMXXX",
    });
    expect(mockDb.getAll).toHaveBeenCalledTimes(1);
    expect(mockDocs.get("2pq_forms/FORM-00031")).not.toHaveProperty(
      "linkedCaseLabel",
    );
  });

  it("combines workflow filters across Firestore windows and resumes after the last match", async () => {
    const { listTwoPQFormsForContext } = await import("../repositories/two-pq-forms.repository");
    const base = {
      formType: "study_request",
      institutionId: "inst-1",
      doctorId: "doctor-1",
      institutionName: "Clínica Norte",
      patientName: "Ada Patient",
      patientInformation: {},
      requestedTest: { pgtAUltraFast: true },
      estimatedTreatmentDate: "2026-12-06",
      linkedBiopsyForm: "FORM-BIOPSY",
    };
    for (let index = 0; index < 35; index += 1) {
      const id = `FILTER-SKIP-${index}`;
      mockDocs.set(`2pq_forms/${id}`, {
        ...base,
        requestedTest: { pgtAFast: true },
        createdAt: `2026-11-15T10:00:${String(index).padStart(2, "0")}.000Z`,
      });
    }
    mockDocs.set("2pq_forms/FILTER-FIRST", { ...base, createdAt: "2026-11-14T10:00:00.000Z" });
    mockDocs.set("2pq_forms/FILTER-SECOND", { ...base, estimatedTreatmentDate: "2026-12-07", createdAt: "2026-11-13T10:00:00.000Z" });
    mockDocs.set("2pq_forms/FILTER-OUTSIDE-DATE", { ...base, estimatedTreatmentDate: "2026-12-10", createdAt: "2026-11-12T10:00:00.000Z" });
    const filters = {
      formType: "study_request",
      workflowStage: "biopsy",
      requestedStudyTest: "pgtAUltraFast",
      treatmentFrom: "2026-12-06",
      treatmentTo: "2026-12-07",
      institution: "clinica norte",
      search: "ada",
      limit: 1,
    } as const;
    const first = await listTwoPQFormsForContext(fullAdminContext, filters);
    expect(first.forms.map(({ id }) => id)).toEqual(["FILTER-FIRST"]);
    expect(first).toMatchObject({ hasMore: true, nextCursor: "FILTER-FIRST" });
    const second = await listTwoPQFormsForContext(fullAdminContext, { ...filters, cursor: first.nextCursor! });
    expect(second.forms.map(({ id }) => id)).toEqual(["FILTER-SECOND"]);
    const third = await listTwoPQFormsForContext(fullAdminContext, { ...filters, cursor: second.nextCursor! });
    expect(third).toEqual({ forms: [], hasMore: false, nextCursor: null });
  });
});
