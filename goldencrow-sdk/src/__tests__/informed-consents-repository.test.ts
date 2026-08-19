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

function docsForCollection(name: string) {
  if (name === "2pq-informed-consent") return consentDocs;
  if (name === "patients") return patientDocs;
  return [];
}

const queryStubs: QueryStub[] = [];
const failOrderedCollections = new Set<string>();
const setDocMock = jest.fn(async (_document: unknown) => undefined);
const transactionSetMock = jest.fn();
const sendGmailMessageMock = jest.fn(async (_message: unknown) => undefined);

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
      field: typeof field === "string" ? field : (field.__fieldPath ?? "__name__"),
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
      id,
      get: jest.fn(async () => ({
        id,
        exists: Boolean(doc),
        data: () => doc?.data,
      })),
      set: setDocMock,
    };
  }
}

jest.mock("firebase-admin/firestore", () => ({
  FieldPath: {
    documentId: () => ({ __fieldPath: "__name__" }),
  },
}));

jest.mock("../config/firebase.js", () => ({
  adminDbFor: jest.fn(() => ({
    collection: jest.fn((name: string) => {
      const query = new QueryStub(name, docsForCollection(name));
      queryStubs.push(query);
      return query;
    }),
    runTransaction: jest.fn(async (callback: (transaction: unknown) => unknown) =>
      callback({
        get: jest.fn(async () => ({
          data: () => ({ current: 3 }),
        })),
        set: transactionSetMock,
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
  projectAccess: ["mydnamap" as const],
};

describe("informed consent repository scoping", () => {
  beforeEach(() => {
    queryStubs.length = 0;
    failOrderedCollections.clear();
    failOrderedCollections.add("2pq-informed-consent");
    failOrderedCollections.add("patients");
    setDocMock.mockClear();
    transactionSetMock.mockClear();
    sendGmailMessageMock.mockClear();
  });

  it("returns global, institution, and doctor lists within their exact scope", async () => {
    const { listInformedConsentsForContext } = await import(
      "../repositories/informed-consents.repository"
    );

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
    expect(doctor.records.map((record) => record.id)).toEqual([
      "CONS-00001",
    ]);
  });

  it("falls back to a bounded scoped query when the ordered index is missing", async () => {
    const { listInformedConsentsForContext } = await import(
      "../repositories/informed-consents.repository"
    );

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
    const { listInformedConsentPatientsForContext } = await import(
      "../repositories/informed-consents.repository"
    );

    const result = await listInformedConsentPatientsForContext({
      ...baseContext,
      role: "institution_doctor",
      institutionId: "INST-00001",
      doctorId: "DOC-00001",
    });

    expect(result.patients.map((patient) => patient.id)).toEqual([
      "PAT-00001",
    ]);
  });

  it("rejects organization publishers from informed consent surfaces", async () => {
    const {
      createInformedConsentForContext,
      getInformedConsentFileForContext,
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
      message: "Organization publishers cannot access informed consents.",
      statusCode: 403,
    };

    await expect(listInformedConsentsForContext(blockedContext)).rejects.toMatchObject(expectedError);
    await expect(listInformedConsentPatientsForContext(blockedContext)).rejects.toMatchObject(expectedError);
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
    const { createInformedConsentForContext } = await import(
      "../repositories/informed-consents.repository"
    );

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
        file: {
          name: "consent.pdf",
          type: "application/pdf",
          size: 1,
          content: "data:application/pdf;base64,eA==",
        },
      }),
    );
  });

  it("sends a consent request email to a scoped patient", async () => {
    const { sendInformedConsentEmailForContext } = await import(
      "../repositories/informed-consents.repository"
    );

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
      | { html: string; text: string }
      | undefined;
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
