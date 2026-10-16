export {};

type QueryOperation =
  | { type: "where"; field: string; value: unknown }
  | { type: "orderBy"; field: string; direction?: string }
  | { type: "limit"; value: number }
  | { type: "startAfter"; value: unknown };

type MockDoc = { id: string; data: Record<string, unknown> };

const consentDocs: MockDoc[] = [
  consentDoc("CONS-00003", "INST-00002", "DOC-00001", "PAT-00003"),
  consentDoc("CONS-00002", "INST-00001", "DOC-00002", "PAT-00002"),
  consentDoc("CONS-00001", "INST-00001", "DOC-00001", "PAT-00001"),
];

const patientDocs: MockDoc[] = [
  patientDoc("PAT-00001", "INST-00001", "DOC-00001"),
  patientDoc("PAT-00002", "INST-00001", "DOC-00002"),
  patientDoc("PAT-00003", "INST-00002", "DOC-00001"),
];

const caseDocs: MockDoc[] = [
  caseDoc("CASE-00001", "INST-00001", "DOC-00001", "PAT-00001"),
  caseDoc("CASE-00002", "INST-00001", "DOC-00002", "PAT-00002"),
  caseDoc("CASE-00003", "INST-00001", "DOC-00001", "PAT-00001"),
];

function consentDoc(
  id: string,
  institutionId: string,
  doctorId: string,
  patientId: string,
): MockDoc {
  return {
    id,
    data: {
      collectionKey: "2pq-informed-consent",
      institutionId,
      doctorId,
      patientId,
      caseId: null,
      file: {
        name: `${id}.pdf`,
        type: "application/pdf",
        size: 1,
        content: "data:application/pdf;base64,eA==",
      },
      createdAt: "2026-08-12T12:00:00.000Z",
      updatedAt: "2026-08-12T12:00:00.000Z",
      createdByEmail: "patient@example.com",
    },
  };
}

function patientDoc(
  id: string,
  institutionId: string,
  doctorId: string,
): MockDoc {
  return {
    id,
    data: {
      institutionId,
      doctorId,
      email: `${id.toLowerCase()}@example.com`,
      fullName: id,
      temporary_password: "ABCDEFGH",
      status: "active",
      createdAt: "2026-08-12T12:00:00.000Z",
      updatedAt: "2026-08-12T12:00:00.000Z",
    },
  };
}

function caseDoc(
  id: string,
  institutionId: string,
  doctorId: string,
  patientId: string,
): MockDoc {
  return {
    id,
    data: {
      collectionKey: "2pq_case",
      areaKey: "cases",
      institutionId,
      doctorId,
      patientId,
      informedConsentId: null,
      caseLabel: id,
      caseStatus: "created",
      createdAt: "2026-08-12T12:00:00.000Z",
      updatedAt: "2026-08-12T12:00:00.000Z",
    },
  };
}

function docsForCollection(name: string) {
  if (name === "2pq-informed-consent") return consentDocs;
  if (name === "patients") return patientDocs;
  if (name === "2pq_case") return caseDocs;
  return [];
}

const queryStubs: QueryStub[] = [];
const documentReads: Array<{ collectionName: string; id: string }> = [];
const failOrderedCollections = new Set<string>();
const setDocMock = jest.fn(async (_document: unknown) => undefined);
const deleteDocMock = jest.fn(async () => undefined);
const transactionSetMock = jest.fn();
const transactionDeleteMock = jest.fn();
const sendGmailMessageMock = jest.fn(async (_message: unknown) => undefined);
let mockTransactionPatientOverride: MockDoc | null | undefined;

function expectNoEntityTransactionWrites() {
  expect(
    transactionSetMock.mock.calls.filter(
      ([reference]) => reference.collectionName !== "admin_sequences",
    ),
  ).toEqual([]);
}

class QueryStub {
  readonly operations: QueryOperation[] = [];

  constructor(
    readonly collectionName: string,
    private readonly docs: MockDoc[],
  ) {}

  where(field: string, _operator: string, value: unknown) {
    this.operations.push({ type: "where", field, value });
    return this;
  }

  orderBy(field: { __fieldPath?: string } | string, direction?: string) {
    this.operations.push({
      type: "orderBy",
      field:
        typeof field === "string" ? field : (field.__fieldPath ?? "__name__"),
      direction,
    });
    return this;
  }

  limit(value: number) {
    this.operations.push({ type: "limit", value });
    return this;
  }

  startAfter(value: unknown) {
    this.operations.push({ type: "startAfter", value });
    return this;
  }

  async get() {
    if (
      failOrderedCollections.has(this.collectionName) &&
      this.operations.some((operation) => operation.type === "orderBy")
    ) {
      const error = new Error("The query requires an index.");
      (error as Error & { code?: string }).code = "failed-precondition";
      throw error;
    }

    return {
      docs: this.docs.map((doc) => ({
        id: doc.id,
        exists: true,
        data: () => doc.data,
      })),
    };
  }

  doc(id: string) {
    const doc = this.docs.find((candidate) => candidate.id === id);
    return {
      collectionName: this.collectionName,
      id,
      get: jest.fn(async () => {
        documentReads.push({ collectionName: this.collectionName, id });
        return {
          id,
          exists: Boolean(doc),
          data: () => doc?.data,
        };
      }),
      set: setDocMock,
      delete: deleteDocMock,
    };
  }
}

const mockServerTimestamp = { __type: "server_timestamp" };

jest.mock("firebase-admin/firestore", () => ({
  FieldPath: {
    documentId: () => ({ __fieldPath: "__name__" }),
  },
  FieldValue: {
    serverTimestamp: () => mockServerTimestamp,
  },
}));

jest.mock("../config/firebase.js", () => ({
  adminDbFor: jest.fn(() => ({
    collection: jest.fn((name: string) => {
      const query = new QueryStub(name, docsForCollection(name));
      queryStubs.push(query);
      return query;
    }),
    runTransaction: jest.fn(
      async (callback: (transaction: unknown) => unknown) =>
        callback({
          get: jest.fn(
            async (reference: { collectionName?: string; id?: string }) => {
              if (reference.collectionName === "admin_sequences") {
                return {
                  id: reference.id,
                  exists: true,
                  data: () => ({ current: 3 }),
                };
              }
              const doc =
                reference.collectionName === "patients" &&
                mockTransactionPatientOverride !== undefined
                  ? mockTransactionPatientOverride
                  : docsForCollection(reference.collectionName ?? "").find(
                      (candidate) => candidate.id === reference.id,
                    );
              return {
                id: doc?.id ?? reference.id,
                exists: Boolean(doc),
                data: () => doc?.data,
              };
            },
          ),
          set: transactionSetMock,
          delete: transactionDeleteMock,
        }),
    ),
  })),
}));

jest.mock("../lib/gmail-mailer.js", () => ({
  sendGmailMessage: sendGmailMessageMock,
}));

const baseContext = {
  email: "operator@example.com",
  uid: "uid-1",
  isBootstrap: false,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  projectAccess: ["mydnamap" as const],
};

const SAVED_SIGNATURE =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";

describe("informed consent repository scoping", () => {
  beforeEach(() => {
    queryStubs.length = 0;
    documentReads.length = 0;
    failOrderedCollections.clear();
    failOrderedCollections.add("2pq-informed-consent");
    failOrderedCollections.add("patients");
    setDocMock.mockClear();
    deleteDocMock.mockClear();
    transactionSetMock.mockClear();
    transactionDeleteMock.mockClear();
    sendGmailMessageMock.mockClear();
    mockTransactionPatientOverride = undefined;
    consentDocs.forEach((doc) => {
      doc.data.caseId = null;
    });
    caseDocs.forEach((doc) => {
      doc.data.informedConsentId = null;
    });
    patientDocs.forEach((doc) => {
      delete doc.data.saved_signature;
    });
  });

  it("returns global, institution, and doctor lists within their exact scope", async () => {
    const { listInformedConsentsForContext } =
      await import("../repositories/informed-consents.repository");

    const fullAdmin = await listInformedConsentsForContext({
      ...baseContext,
      role: "full_admin",
    });
    const institutionAdmin = await listInformedConsentsForContext({
      ...baseContext,
      role: "institution_admin",
      institutionId: "INST-00001",
    });
    const doctor = await listInformedConsentsForContext({
      ...baseContext,
      role: "institution_doctor",
      institutionId: "INST-00001",
      doctorId: "DOC-00001",
    });

    expect(fullAdmin.records.map((record) => record.id)).toEqual([
      "CONS-00003",
      "CONS-00002",
      "CONS-00001",
    ]);
    expect(institutionAdmin.records.map((record) => record.id)).toEqual([
      "CONS-00002",
      "CONS-00001",
    ]);
    expect(doctor.records.map((record) => record.id)).toEqual(["CONS-00001"]);
  });

  it("falls back to a bounded scoped query when the ordered index is missing", async () => {
    const { listInformedConsentsForContext } =
      await import("../repositories/informed-consents.repository");

    await listInformedConsentsForContext({
      ...baseContext,
      role: "institution_doctor",
      institutionId: "INST-00001",
      doctorId: "DOC-00001",
    });

    const consentQueries = queryStubs.filter(
      (query) => query.collectionName === "2pq-informed-consent",
    );
    expect(consentQueries[0]?.operations).toEqual([
      { type: "where", field: "institutionId", value: "INST-00001" },
      { type: "orderBy", field: "__name__", direction: "desc" },
      { type: "limit", value: 21 },
    ]);
    expect(consentQueries[1]?.operations).toEqual([
      { type: "where", field: "institutionId", value: "INST-00001" },
      { type: "limit", value: 21 },
    ]);
  });

  it("limits the doctor upload selector to that doctor's patients", async () => {
    const { listInformedConsentPatientsForContext } =
      await import("../repositories/informed-consents.repository");

    const result = await listInformedConsentPatientsForContext({
      ...baseContext,
      role: "institution_doctor",
      institutionId: "INST-00001",
      doctorId: "DOC-00001",
    });

    expect(result.patients.map((patient) => patient.id)).toEqual(["PAT-00001"]);
  });

  describe("saved signature lookup", () => {
    it("lets a patient read only their own valid saved signature", async () => {
      patientDocs[0]!.data.saved_signature = SAVED_SIGNATURE;
      const { getSavedInformedConsentSignatureForContext } =
        await import("../repositories/informed-consents.repository");

      await expect(
        getSavedInformedConsentSignatureForContext({
          ...baseContext,
          role: "patient",
          patientId: "PAT-00001",
          canAccessBackoffice: false,
          canAccessPatientPortal: true,
        }),
      ).resolves.toEqual({ savedSignature: SAVED_SIGNATURE });
      expect(documentReads).toEqual([
        { collectionName: "patients", id: "PAT-00001" },
      ]);
    });

    it("lets a scoped backoffice doctor read one selected patient signature", async () => {
      patientDocs[0]!.data.saved_signature = SAVED_SIGNATURE;
      const { getSavedInformedConsentSignatureForContext } =
        await import("../repositories/informed-consents.repository");

      await expect(
        getSavedInformedConsentSignatureForContext(
          {
            ...baseContext,
            role: "institution_doctor",
            institutionId: "INST-00001",
            doctorId: "DOC-00001",
          },
          "PAT-00001",
        ),
      ).resolves.toEqual({ savedSignature: SAVED_SIGNATURE });
      expect(documentReads).toEqual([
        { collectionName: "patients", id: "PAT-00001" },
      ]);
    });

    it.each([
      ["missing", undefined],
      ["invalid", "data:image/png;base64,aW52YWxpZA=="],
    ])("normalizes a %s persisted signature to null", async (_, value) => {
      patientDocs[0]!.data.saved_signature = value;
      const { getSavedInformedConsentSignatureForContext } =
        await import("../repositories/informed-consents.repository");

      await expect(
        getSavedInformedConsentSignatureForContext(
          { ...baseContext, role: "full_admin" },
          "PAT-00001",
        ),
      ).resolves.toEqual({ savedSignature: null });
      expect(documentReads).toEqual([
        { collectionName: "patients", id: "PAT-00001" },
      ]);
    });

    it("rejects a patient targeting another patient before any read", async () => {
      const { getSavedInformedConsentSignatureForContext } =
        await import("../repositories/informed-consents.repository");

      await expect(
        getSavedInformedConsentSignatureForContext(
          {
            ...baseContext,
            role: "patient",
            patientId: "PAT-00001",
            canAccessBackoffice: false,
            canAccessPatientPortal: true,
          },
          "PAT-00002",
        ),
      ).rejects.toMatchObject({
        message: "Patients can only access their own saved signature.",
        statusCode: 403,
      });
      expect(documentReads).toEqual([]);
    });

    it("rejects a backoffice caller outside the selected patient's scope", async () => {
      const { getSavedInformedConsentSignatureForContext } =
        await import("../repositories/informed-consents.repository");

      await expect(
        getSavedInformedConsentSignatureForContext(
          {
            ...baseContext,
            role: "institution_doctor",
            institutionId: "INST-00001",
            doctorId: "DOC-00001",
          },
          "PAT-00002",
        ),
      ).rejects.toMatchObject({
        message: "You cannot access this patient's saved signature.",
        statusCode: 403,
      });
      expect(documentReads).toEqual([
        { collectionName: "patients", id: "PAT-00002" },
      ]);
    });
  });

  it("lists only the selected patient's assignable 2PQ cases", async () => {
    const { listInformedConsentCasesForContext } =
      await import("../repositories/informed-consents.repository");

    const result = await listInformedConsentCasesForContext(
      { ...baseContext, role: "2pq_admin" },
      "PAT-00001",
    );

    expect(result.cases.map((item) => item.id)).toEqual([
      "CASE-00001",
      "CASE-00003",
    ]);
    const caseQuery = queryStubs.find(
      (query) => query.collectionName === "2pq_case",
    );
    expect(caseQuery?.operations).toContainEqual({
      type: "where",
      field: "patientId",
      value: "PAT-00001",
    });
    expect(caseQuery?.operations).toContainEqual({
      type: "limit",
      value: 21,
    });
  });

  it("rejects organization publishers from informed consent surfaces", async () => {
    const {
      createInformedConsentForContext,
      getInformedConsentFileForContext,
      listInformedConsentCasesForContext,
      listInformedConsentPatientsForContext,
      listInformedConsentsForContext,
      sendInformedConsentEmailForContext,
    } = await import("../repositories/informed-consents.repository");
    const blockedContext = {
      ...baseContext,
      role: "organization_publisher" as const,
      organizationId: "ORG-00001",
    };
    const expectedError = {
      message: "Discover publishers cannot access informed consents.",
      statusCode: 403,
    };

    await expect(
      listInformedConsentsForContext(blockedContext),
    ).rejects.toMatchObject(expectedError);
    await expect(
      listInformedConsentPatientsForContext(blockedContext),
    ).rejects.toMatchObject(expectedError);
    await expect(
      listInformedConsentCasesForContext(blockedContext, "PAT-00001"),
    ).rejects.toMatchObject(expectedError);
    await expect(
      createInformedConsentForContext(blockedContext, {
        patientId: "PAT-00001",
        file: {
          name: "consent.pdf",
          type: "application/pdf",
          size: 1,
          content: "data:application/pdf;base64,eA==",
        },
      }),
    ).rejects.toMatchObject(expectedError);
    await expect(
      sendInformedConsentEmailForContext(blockedContext, {
        patientId: "PAT-00001",
      }),
    ).rejects.toMatchObject(expectedError);
    await expect(
      getInformedConsentFileForContext(blockedContext, "CONS-00001"),
    ).rejects.toMatchObject(expectedError);
  });

  it("stores uploaded consent bytes in Firestore", async () => {
    const { createInformedConsentForContext } =
      await import("../repositories/informed-consents.repository");

    const record = await createInformedConsentForContext(
      {
        ...baseContext,
        role: "full_admin",
      },
      {
        patientId: "PAT-00001",
        file: {
          name: "consent.pdf",
          type: "application/pdf",
          size: 1,
          content: "data:application/pdf;base64,eA==",
        },
      },
    );

    expect(record.id).toBe("CONS-00004");
    expect(setDocMock).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: null,
        file: {
          name: "consent.pdf",
          type: "application/pdf",
          size: 1,
          content: "data:application/pdf;base64,eA==",
        },
      }),
    );
  });

  it("atomically stores a guided consent and the exact patient saved_signature field", async () => {
    const { createInformedConsentForContext } =
      await import("../repositories/informed-consents.repository");

    await createInformedConsentForContext(
      { ...baseContext, role: "full_admin" },
      {
        patientId: "PAT-00001",
        flowMode: "guided",
        savedSignature: SAVED_SIGNATURE,
        file: {
          name: "consent.pdf",
          type: "application/pdf",
          size: 1,
          content: "data:application/pdf;base64,eA==",
        },
      },
    );

    expect(transactionSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionName: "patients",
        id: "PAT-00001",
      }),
      expect.objectContaining({ saved_signature: SAVED_SIGNATURE }),
      { merge: true },
    );
    const patientWrite = transactionSetMock.mock.calls.find(
      ([reference]) => reference.collectionName === "patients",
    )?.[1] as Record<string, unknown>;
    expect(patientWrite).not.toHaveProperty("savedSignature");
    expect(transactionSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionName: "2pq-informed-consent",
        id: "CONS-00004",
      }),
      expect.objectContaining({ patientId: "PAT-00001" }),
    );
    const consentWrite = transactionSetMock.mock.calls.find(
      ([reference]) => reference.collectionName === "2pq-informed-consent",
    )?.[1] as Record<string, unknown>;
    expect(consentWrite).not.toHaveProperty("signatureAttestation");
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it("persists server-authored signature attestation evidence for a guided backoffice upload", async () => {
    const { createInformedConsentForContext } =
      await import("../repositories/informed-consents.repository");

    await createInformedConsentForContext(
      {
        ...baseContext,
        email: "  OPERATOR@EXAMPLE.COM ",
        role: "full_admin",
      },
      {
        patientId: "PAT-00001",
        flowMode: "guided",
        signatureAttestationAccepted: true,
        savedSignature: SAVED_SIGNATURE,
        file: {
          name: "consent.pdf",
          type: "application/pdf",
          size: 1,
          content: "data:application/pdf;base64,eA==",
        },
      },
    );

    const consentWrite = transactionSetMock.mock.calls.find(
      ([reference]) => reference.collectionName === "2pq-informed-consent",
    )?.[1] as Record<string, unknown>;
    expect(consentWrite).toMatchObject({
      patientId: "PAT-00001",
      signatureAttestation: {
        accepted: true,
        acceptedAt: mockServerTimestamp,
        patientId: "PAT-00001",
        submittedByEmail: "operator@example.com",
        submittedByUid: baseContext.uid,
        submittedByRole: "full_admin",
        surface: "backoffice",
        statementVersion: "es-v1",
        statement:
          "Declaro, bajo mi responsabilidad, que soy la persona a quien se realizará este estudio, que la firma incorporada en el documento me pertenece y expresa mi voluntad, y que esta aceptación constituye una firma electrónica vinculante del consentimiento informado.",
      },
    });
  });

  it("records the patient portal as the attestation surface for a patient upload", async () => {
    const { createInformedConsentForContext } =
      await import("../repositories/informed-consents.repository");

    await createInformedConsentForContext(
      {
        ...baseContext,
        email: "PATIENT@EXAMPLE.COM",
        role: "patient",
        patientId: "PAT-00001",
        canAccessBackoffice: false,
        canAccessPatientPortal: true,
      },
      {
        flowMode: "guided",
        signatureAttestationAccepted: true,
        savedSignature: SAVED_SIGNATURE,
        file: {
          name: "consent.pdf",
          type: "application/pdf",
          size: 1,
          content: "data:application/pdf;base64,eA==",
        },
      },
    );

    const consentWrite = transactionSetMock.mock.calls.find(
      ([reference]) => reference.collectionName === "2pq-informed-consent",
    )?.[1] as Record<string, unknown>;
    expect(consentWrite).toMatchObject({
      signatureAttestation: {
        patientId: "PAT-00001",
        submittedByEmail: "patient@example.com",
        submittedByUid: baseContext.uid,
        submittedByRole: "patient",
        surface: "patient_portal",
      },
    });
  });

  it.each([
    ["a direct upload", { flowMode: "direct" as const }],
    ["an unclassified upload", {}],
  ])("rejects signature attestation on %s", async (_, uploadFields) => {
    const { createInformedConsentForContext } =
      await import("../repositories/informed-consents.repository");

    await expect(
      createInformedConsentForContext(
        { ...baseContext, role: "full_admin" },
        {
          patientId: "PAT-00001",
          ...uploadFields,
          signatureAttestationAccepted: true,
          file: {
            name: "consent.pdf",
            type: "application/pdf",
            size: 1,
            content: "data:application/pdf;base64,eA==",
          },
        },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(transactionSetMock).not.toHaveBeenCalled();
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it("rejects a false signature attestation defensively", async () => {
    const { createInformedConsentForContext } =
      await import("../repositories/informed-consents.repository");

    await expect(
      createInformedConsentForContext(
        { ...baseContext, role: "full_admin" },
        {
          patientId: "PAT-00001",
          flowMode: "guided",
          signatureAttestationAccepted: false,
          savedSignature: SAVED_SIGNATURE,
          file: {
            name: "consent.pdf",
            type: "application/pdf",
            size: 1,
            content: "data:application/pdf;base64,eA==",
          },
        },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(transactionSetMock).not.toHaveBeenCalled();
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it.each([
    ["without a case", undefined],
    ["with a case", "CASE-00001"],
  ])(
    "does not recreate a concurrently deleted patient %s",
    async (_, caseId) => {
      mockTransactionPatientOverride = null;
      const { createInformedConsentForContext } =
        await import("../repositories/informed-consents.repository");

      await expect(
        createInformedConsentForContext(
          { ...baseContext, role: "full_admin" },
          {
            patientId: "PAT-00001",
            caseId,
            flowMode: "guided",
            savedSignature: SAVED_SIGNATURE,
            file: {
              name: "consent.pdf",
              type: "application/pdf",
              size: 1,
              content: "data:application/pdf;base64,eA==",
            },
          },
        ),
      ).rejects.toMatchObject({
        message: "Patient not found.",
        statusCode: 404,
      });

      expectNoEntityTransactionWrites();
      expect(setDocMock).not.toHaveBeenCalled();
    },
  );

  it("revalidates patient scope before saving a guided signature", async () => {
    mockTransactionPatientOverride = patientDoc(
      "PAT-00001",
      "INST-00002",
      "DOC-00002",
    );
    const { createInformedConsentForContext } =
      await import("../repositories/informed-consents.repository");

    await expect(
      createInformedConsentForContext(
        {
          ...baseContext,
          role: "institution_doctor",
          institutionId: "INST-00001",
          doctorId: "DOC-00001",
        },
        {
          patientId: "PAT-00001",
          caseId: "CASE-00001",
          flowMode: "guided",
          savedSignature: SAVED_SIGNATURE,
          file: {
            name: "consent.pdf",
            type: "application/pdf",
            size: 1,
            content: "data:application/pdf;base64,eA==",
          },
        },
      ),
    ).rejects.toMatchObject({
      message: "You cannot upload consent files for this patient.",
      statusCode: 403,
    });

    expectNoEntityTransactionWrites();
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it("rejects a guided signature when patient identity changes concurrently", async () => {
    const changedPatient = patientDoc("PAT-00001", "INST-00001", "DOC-00001");
    changedPatient.data.email = "replacement@example.com";
    mockTransactionPatientOverride = changedPatient;
    const { createInformedConsentForContext } =
      await import("../repositories/informed-consents.repository");

    await expect(
      createInformedConsentForContext(
        { ...baseContext, role: "full_admin" },
        {
          patientId: "PAT-00001",
          flowMode: "guided",
          savedSignature: SAVED_SIGNATURE,
          file: {
            name: "consent.pdf",
            type: "application/pdf",
            size: 1,
            content: "data:application/pdf;base64,eA==",
          },
        },
      ),
    ).rejects.toMatchObject({
      message:
        "The patient identity or assignment changed while the consent was being saved.",
      statusCode: 409,
    });

    expectNoEntityTransactionWrites();
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it("never changes an existing saved signature for a direct upload", async () => {
    const { createInformedConsentForContext } =
      await import("../repositories/informed-consents.repository");

    await createInformedConsentForContext(
      { ...baseContext, role: "full_admin" },
      {
        patientId: "PAT-00001",
        flowMode: "direct",
        file: {
          name: "consent.pdf",
          type: "application/pdf",
          size: 1,
          content: "data:application/pdf;base64,eA==",
        },
      },
    );

    expect(
      transactionSetMock.mock.calls.some(
        ([reference]) => reference.collectionName === "patients",
      ),
    ).toBe(false);
    expect(setDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: "PAT-00001" }),
    );
  });

  it("rejects invalid guided signature data before creating any document", async () => {
    const { createInformedConsentForContext } =
      await import("../repositories/informed-consents.repository");

    await expect(
      createInformedConsentForContext(
        { ...baseContext, role: "full_admin" },
        {
          patientId: "PAT-00001",
          flowMode: "guided",
          savedSignature: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
          file: {
            name: "consent.pdf",
            type: "application/pdf",
            size: 1,
            content: "data:application/pdf;base64,eA==",
          },
        },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(transactionSetMock).not.toHaveBeenCalled();
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it("prevents a patient from saving a signature onto another patient", async () => {
    const { createInformedConsentForContext } =
      await import("../repositories/informed-consents.repository");

    await expect(
      createInformedConsentForContext(
        {
          ...baseContext,
          role: "patient",
          patientId: "PAT-00001",
          canAccessBackoffice: false,
          canAccessPatientPortal: true,
        },
        {
          patientId: "PAT-00002",
          flowMode: "guided",
          savedSignature: SAVED_SIGNATURE,
          file: {
            name: "consent.pdf",
            type: "application/pdf",
            size: 1,
            content: "data:application/pdf;base64,eA==",
          },
        },
      ),
    ).rejects.toMatchObject({
      message: "Patients can only upload their own consent files.",
      statusCode: 403,
    });
  });

  it("creates and links an admin consent to its selected case atomically", async () => {
    const { createInformedConsentForContext } =
      await import("../repositories/informed-consents.repository");

    const record = await createInformedConsentForContext(
      { ...baseContext, role: "2pq_admin" },
      {
        patientId: "PAT-00001",
        caseId: "CASE-00001",
        file: {
          name: "consent.pdf",
          type: "application/pdf",
          size: 1,
          content: "data:application/pdf;base64,eA==",
        },
      },
    );

    expect(record).toMatchObject({
      id: "CONS-00004",
      patientId: "PAT-00001",
      caseId: "CASE-00001",
    });
    expect(transactionSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionName: "2pq-informed-consent",
        id: "CONS-00004",
      }),
      expect.objectContaining({
        patientId: "PAT-00001",
        caseId: "CASE-00001",
      }),
    );
    expect(transactionSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionName: "2pq_case",
        id: "CASE-00001",
      }),
      expect.objectContaining({ informedConsentId: "CONS-00004" }),
      { merge: true },
    );
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it("includes the patient signature in the same case-link transaction", async () => {
    const { createInformedConsentForContext } =
      await import("../repositories/informed-consents.repository");

    await createInformedConsentForContext(
      { ...baseContext, role: "2pq_admin" },
      {
        patientId: "PAT-00001",
        caseId: "CASE-00001",
        flowMode: "guided",
        savedSignature: SAVED_SIGNATURE,
        file: {
          name: "consent.pdf",
          type: "application/pdf",
          size: 1,
          content: "data:application/pdf;base64,eA==",
        },
      },
    );

    expect(transactionSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ collectionName: "patients", id: "PAT-00001" }),
      expect.objectContaining({ saved_signature: SAVED_SIGNATURE }),
      { merge: true },
    );
    expect(transactionSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ collectionName: "2pq_case", id: "CASE-00001" }),
      expect.objectContaining({ informedConsentId: "CONS-00004" }),
      { merge: true },
    );
  });

  it("lets global admins delete only the consent document", async () => {
    const { deleteInformedConsentForContext } =
      await import("../repositories/informed-consents.repository");

    await expect(
      deleteInformedConsentForContext(
        { ...baseContext, role: "2pq_admin" },
        "CONS-00001",
      ),
    ).resolves.toEqual({ success: true, consentId: "CONS-00001" });

    expect(transactionDeleteMock).toHaveBeenCalledTimes(1);
  });

  it("rejects consent deletion by non-global roles", async () => {
    const { deleteInformedConsentForContext } =
      await import("../repositories/informed-consents.repository");

    await expect(
      deleteInformedConsentForContext(
        {
          ...baseContext,
          role: "institution_admin",
          institutionId: "INST-00001",
        },
        "CONS-00001",
      ),
    ).rejects.toMatchObject({
      message: "Only full or 2PQ admins can delete informed consents.",
      statusCode: 403,
    });
    expect(deleteDocMock).not.toHaveBeenCalled();
  });

  it("returns not found when deleting a missing consent", async () => {
    const { deleteInformedConsentForContext } =
      await import("../repositories/informed-consents.repository");

    await expect(
      deleteInformedConsentForContext(
        { ...baseContext, role: "full_admin" },
        "CONS-99999",
      ),
    ).rejects.toMatchObject({ message: "Consent not found.", statusCode: 404 });
    expect(deleteDocMock).not.toHaveBeenCalled();
  });

  it("links a consent and matching 2PQ case with reciprocal transaction writes", async () => {
    const { setInformedConsentCaseForContext } =
      await import("../repositories/informed-consents.repository");

    await setInformedConsentCaseForContext(
      { ...baseContext, role: "2pq_admin" },
      "CONS-00001",
      "CASE-00001",
    );

    expect(transactionSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionName: "2pq-informed-consent",
        id: "CONS-00001",
      }),
      expect.objectContaining({ caseId: "CASE-00001" }),
      { merge: true },
    );
    expect(transactionSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionName: "2pq_case",
        id: "CASE-00001",
      }),
      expect.objectContaining({ informedConsentId: "CONS-00001" }),
      { merge: true },
    );
  });

  it("rejects linking a consent to a case for another patient or doctor", async () => {
    const { setInformedConsentCaseForContext } =
      await import("../repositories/informed-consents.repository");

    await expect(
      setInformedConsentCaseForContext(
        { ...baseContext, role: "2pq_admin" },
        "CONS-00001",
        "CASE-00002",
      ),
    ).rejects.toMatchObject({
      message:
        "Consent and 2PQ case must belong to the same patient, institution, and doctor.",
      statusCode: 409,
    });
  });

  it("atomically clears both displaced links when a consent changes cases", async () => {
    consentDocs[2]!.data.caseId = "CASE-00003";
    consentDocs[0]!.data.caseId = "CASE-00001";
    caseDocs[0]!.data.informedConsentId = "CONS-00003";
    caseDocs[2]!.data.informedConsentId = "CONS-00001";
    const { setInformedConsentCaseForContext } =
      await import("../repositories/informed-consents.repository");

    await setInformedConsentCaseForContext(
      { ...baseContext, role: "full_admin" },
      "CONS-00001",
      "CASE-00001",
    );

    expect(transactionSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "CASE-00003" }),
      expect.objectContaining({ informedConsentId: null }),
      { merge: true },
    );
    expect(transactionSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "CONS-00003" }),
      expect.objectContaining({ caseId: null }),
      { merge: true },
    );
    expect(transactionSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "CONS-00001" }),
      expect.objectContaining({ caseId: "CASE-00001" }),
      { merge: true },
    );
    expect(transactionSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "CASE-00001" }),
      expect.objectContaining({ informedConsentId: "CONS-00001" }),
      { merge: true },
    );
  });

  it("sends a consent request email to a scoped patient", async () => {
    const { sendInformedConsentEmailForContext } =
      await import("../repositories/informed-consents.repository");

    const result = await sendInformedConsentEmailForContext(
      {
        ...baseContext,
        email: "dopazoh+admin@gmail.com",
        role: "institution_doctor",
        institutionId: "INST-00001",
        doctorId: "DOC-00001",
      },
      { patientId: "PAT-00001" },
    );

    expect(result).toEqual({
      ok: true,
      patientId: "PAT-00001",
      email: "pat-00001@example.com",
    });
    expect(sendGmailMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "pat-00001@example.com",
        subject: "Consentimiento informado 2PQ",
      }),
    );
    const message = sendGmailMessageMock.mock.calls[0]?.[0] as
      { html: string; text: string } | undefined;
    expect(message?.html).toContain("Esta es tu clave de seguridad.");
    expect(message?.html).toContain("ABCDEFGH");
    expect(message?.html).not.toContain("Usuario:");
    expect(message?.html).toContain("/patient-portal/login");
    expect(message?.html).toContain("email=pat-00001%40example.com");
    expect(message?.html).toContain("callbackUrl=%2Fpatient-portal%2Fconsents");
    expect(message?.text).toContain("Esta es tu clave de seguridad.");
    expect(message?.text).toContain("ABCDEFGH");
    expect(message?.text).not.toContain("Usuario:");
    expect(message?.text).toContain("/patient-portal/login");
    expect(message?.text).toContain("email=pat-00001%40example.com");
    expect(message?.text).toContain("callbackUrl=%2Fpatient-portal%2Fconsents");
  });
});
