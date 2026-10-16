// Route-level tests for /2pq/informed-consents* and the case traceability
// endpoint. The route requires an admin context and validates input; the
// per-role scoping lives in the repository (informed-consent-access.test.ts),
// so here we check that its 403/404 decisions reach the client untouched.
import type { FastifyInstance } from "fastify";
import { AdminRepositoryError } from "../repositories/admin-errors.js";
import type { AdminContext } from "../types/sdk.types.js";
import { buildRouteServer, makeAdminContext } from "./support/route-harness.js";

const mockCreateInformedConsentForContext = jest.fn();
const mockDeleteInformedConsentForContext = jest.fn();
const mockGetCaseConsentTraceabilityForContext = jest.fn();
const mockGetInformedConsentDraftForContext = jest.fn();
const mockGetInformedConsentDraftStatusForContext = jest.fn();
const mockGetInformedConsentDetailForContext = jest.fn();
const mockGetInformedConsentFileForContext = jest.fn();
const mockGetSavedInformedConsentSignatureForContext = jest.fn();
const mockListInformedConsentCasesForContext = jest.fn();
const mockListInformedConsentPatientsForContext = jest.fn();
const mockListInformedConsentsForContext = jest.fn();
const mockSendInformedConsentEmailForContext = jest.fn();
const mockSetInformedConsentCaseForContext = jest.fn();
const mockUpsertInformedConsentDraftForContext = jest.fn();

jest.mock("../repositories/informed-consents.repository.js", () => ({
  INFORMED_CONSENT_FILE_MAX_BYTES: 750_000,
  createInformedConsentForContext: mockCreateInformedConsentForContext,
  deleteInformedConsentForContext: mockDeleteInformedConsentForContext,
  getCaseConsentTraceabilityForContext:
    mockGetCaseConsentTraceabilityForContext,
  getInformedConsentDraftForContext: mockGetInformedConsentDraftForContext,
  getInformedConsentDraftStatusForContext:
    mockGetInformedConsentDraftStatusForContext,
  getInformedConsentDetailForContext: mockGetInformedConsentDetailForContext,
  getInformedConsentFileForContext: mockGetInformedConsentFileForContext,
  getSavedInformedConsentSignatureForContext:
    mockGetSavedInformedConsentSignatureForContext,
  listInformedConsentCasesForContext: mockListInformedConsentCasesForContext,
  listInformedConsentPatientsForContext:
    mockListInformedConsentPatientsForContext,
  listInformedConsentsForContext: mockListInformedConsentsForContext,
  sendInformedConsentEmailForContext: mockSendInformedConsentEmailForContext,
  setInformedConsentCaseForContext: mockSetInformedConsentCaseForContext,
  upsertInformedConsentDraftForContext:
    mockUpsertInformedConsentDraftForContext,
}));

const repositoryMocks = [
  mockCreateInformedConsentForContext,
  mockDeleteInformedConsentForContext,
  mockGetCaseConsentTraceabilityForContext,
  mockGetInformedConsentDraftForContext,
  mockGetInformedConsentDraftStatusForContext,
  mockGetInformedConsentDetailForContext,
  mockGetInformedConsentFileForContext,
  mockGetSavedInformedConsentSignatureForContext,
  mockListInformedConsentCasesForContext,
  mockListInformedConsentPatientsForContext,
  mockListInformedConsentsForContext,
  mockSendInformedConsentEmailForContext,
  mockSetInformedConsentCaseForContext,
  mockUpsertInformedConsentDraftForContext,
];

function validFile() {
  return {
    name: "consent.pdf",
    type: "application/pdf",
    size: 1234,
    content: Buffer.from("%PDF-1.7").toString("base64"),
  };
}

function validDraft() {
  return {
    expectedRevision: null,
    schemaVersion: 1 as const,
    mode: "guided" as const,
    activeStepId: "download" as const,
    visitedStepIds: ["method", "download"] as const,
    patientName: "Patient One",
    patientDocument: "",
    signatureDate: "2026-10-16",
    hasPartner: false,
    partnerName: "",
    patientSignatureDataUrl: null,
    partnerSignatureDataUrl: null,
    patientSignatureMethod: null,
    partnerSignatureMethod: null,
    patientPlacement: { x: 0.72, y: 0.445, width: 0.16 },
    partnerPlacement: { x: 0.72, y: 0.64, width: 0.16 },
    selectedRole: "patient" as const,
  };
}

const endpoints = [
  { method: "GET" as const, url: "/2pq/informed-consents" },
  { method: "GET" as const, url: "/2pq/informed-consents/patients" },
  { method: "GET" as const, url: "/2pq/informed-consents/saved-signature" },
  { method: "GET" as const, url: "/2pq/informed-consents/draft" },
  { method: "GET" as const, url: "/2pq/informed-consents/draft/status" },
  {
    method: "PUT" as const,
    url: "/2pq/informed-consents/draft",
    payload: validDraft(),
  },
  {
    method: "GET" as const,
    url: "/2pq/informed-consents/cases?patientId=PAT-1",
  },
  {
    method: "POST" as const,
    url: "/2pq/informed-consents",
    payload: { patientId: "PAT-1", file: validFile() },
  },
  {
    method: "POST" as const,
    url: "/2pq/informed-consents/email",
    payload: { patientId: "PAT-1" },
  },
  { method: "GET" as const, url: "/2pq/cases/CASE-1/informed-consent" },
  { method: "GET" as const, url: "/2pq/informed-consents/IC-1" },
  {
    method: "PATCH" as const,
    url: "/2pq/informed-consents/IC-1/case",
    payload: { caseId: "CASE-1" },
  },
  { method: "GET" as const, url: "/2pq/informed-consents/IC-1/file" },
  { method: "DELETE" as const, url: "/2pq/informed-consents/IC-1" },
];

const PATIENT = makeAdminContext({
  uid: "patient-uid",
  email: "patient@example.com",
  role: "patient",
  patientId: "PAT-1",
  canAccessBackoffice: false,
  canAccessPatientPortal: true,
});

let currentContext: AdminContext | undefined;
let fastify: FastifyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  currentContext = makeAdminContext({ role: "2pq_admin" });
  const { informedConsentRoutes } =
    await import("../routes/informed-consents.routes.js");
  fastify = await buildRouteServer(informedConsentRoutes, () => currentContext);
});

afterEach(async () => {
  await fastify.close();
});

describe("informed consent routes — authentication", () => {
  it.each(endpoints)(
    "$method $url returns 401 without a context and calls no repository",
    async ({ method, url, payload }) => {
      currentContext = undefined;

      const response = await fastify.inject({ method, url, payload });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "No authenticated context" });
      for (const mock of repositoryMocks) {
        expect(mock).not.toHaveBeenCalled();
      }
    },
  );

  it.each([
    [
      "another patient's consent detail",
      "GET",
      "/2pq/informed-consents/IC-OTHER",
      mockGetInformedConsentDetailForContext,
    ],
    [
      "another patient's consent file",
      "GET",
      "/2pq/informed-consents/IC-OTHER/file",
      mockGetInformedConsentFileForContext,
    ],
    [
      "deleting a consent",
      "DELETE",
      "/2pq/informed-consents/IC-OTHER",
      mockDeleteInformedConsentForContext,
    ],
  ] as const)(
    "passes the repository's 403 through for a patient reaching %s",
    async (_, method, url, mock) => {
      currentContext = PATIENT;
      mock.mockRejectedValue(
        new AdminRepositoryError(
          "You cannot access this informed consent.",
          403,
        ),
      );

      const response = await fastify.inject({ method, url });

      expect(response.statusCode).toBe(403);
      expect(mock).toHaveBeenCalledWith(PATIENT, "IC-OTHER");
      expect(response.headers["content-disposition"]).toBeUndefined();
    },
  );
});

describe("patient informed consent draft routes", () => {
  it("returns the private full draft for the authenticated patient", async () => {
    currentContext = PATIENT;
    mockGetInformedConsentDraftForContext.mockResolvedValue({
      id: "patient-uid",
      revision: 2,
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/2pq/informed-consents/draft",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json()).toEqual({
      draft: { id: "patient-uid", revision: 2 },
    });
    expect(mockGetInformedConsentDraftForContext).toHaveBeenCalledWith(PATIENT);
  });

  it("returns only the private draft status summary", async () => {
    currentContext = PATIENT;
    mockGetInformedConsentDraftStatusForContext.mockResolvedValue({
      mode: "guided",
      activeStepId: "signature",
      updatedAt: "2026-10-16T12:00:00.000Z",
      revision: 3,
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/2pq/informed-consents/draft/status",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json()).toEqual({
      draft: {
        mode: "guided",
        activeStepId: "signature",
        updatedAt: "2026-10-16T12:00:00.000Z",
        revision: 3,
      },
    });
  });

  it("validates and forwards an exact draft mutation", async () => {
    currentContext = PATIENT;
    const payload = validDraft();
    mockUpsertInformedConsentDraftForContext.mockResolvedValue({
      ...payload,
      id: "patient-uid",
      patientSignatureDataUrl: "private-patient-signature",
      partnerSignatureDataUrl: "private-partner-signature",
      updatedAt: "2026-10-16T12:00:00.000Z",
      revision: 1,
    });

    const response = await fastify.inject({
      method: "PUT",
      url: "/2pq/informed-consents/draft",
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(mockUpsertInformedConsentDraftForContext).toHaveBeenCalledWith(
      PATIENT,
      payload,
    );
    expect(response.json()).toEqual({
      draft: {
        mode: "guided",
        activeStepId: "download",
        updatedAt: "2026-10-16T12:00:00.000Z",
        revision: 1,
      },
    });
  });

  it.each([
    [
      "a step from another mode",
      { ...validDraft(), mode: "direct", activeStepId: "download" },
    ],
    [
      "visited steps from another mode",
      {
        ...validDraft(),
        mode: "direct",
        activeStepId: "direct-download",
      },
    ],
    [
      "duplicate visited steps",
      {
        ...validDraft(),
        visitedStepIds: ["method", "download", "download"],
      },
    ],
    [
      "an absent active step in the visited list",
      { ...validDraft(), visitedStepIds: ["method"] },
    ],
    [
      "an out-of-range placement",
      { ...validDraft(), patientPlacement: { x: 2, y: 0.4, width: 0.16 } },
    ],
    [
      "a signature without its method",
      {
        ...validDraft(),
        patientSignatureDataUrl: "data:image/png;base64,AAAA",
      },
    ],
    [
      "client-authored legal state",
      { ...validDraft(), legalAttestationAccepted: true },
    ],
  ])("rejects %s before calling the repository", async (_, payload) => {
    const response = await fastify.inject({
      method: "PUT",
      url: "/2pq/informed-consents/draft",
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(mockUpsertInformedConsentDraftForContext).not.toHaveBeenCalled();
  });

  it("passes optimistic revision conflicts through", async () => {
    currentContext = PATIENT;
    mockUpsertInformedConsentDraftForContext.mockRejectedValue(
      new AdminRepositoryError(
        "Consent draft changed. Reload it before saving again.",
        409,
      ),
    );

    const response = await fastify.inject({
      method: "PUT",
      url: "/2pq/informed-consents/draft",
      payload: validDraft(),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: "Consent draft changed. Reload it before saving again.",
    });
  });
});

describe("POST /2pq/informed-consents", () => {
  const savedSignature =
    "data:image/png;base64," +
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";

  it.each([
    ["a file over the size limit", { ...validFile(), size: 750_001 }],
    ["a zero-byte file", { ...validFile(), size: 0 }],
    ["an empty content", { ...validFile(), content: "" }],
    [
      "an over-long filename",
      { ...validFile(), name: `${"x".repeat(252)}.pdf` },
    ],
    ["a missing type", { name: "consent.pdf", size: 10, content: "abc" }],
  ])("rejects %s with 400", async (_, file) => {
    const response = await fastify.inject({
      method: "POST",
      url: "/2pq/informed-consents",
      payload: { patientId: "PAT-1", file },
    });

    expect(response.statusCode).toBe(400);
    expect(mockCreateInformedConsentForContext).not.toHaveBeenCalled();
  });

  it("refuses a content over 1.1 MB (zod 400 or Fastify's 1 MiB body limit 413)", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/2pq/informed-consents",
      payload: {
        patientId: "PAT-1",
        file: { ...validFile(), content: "a".repeat(1_100_001) },
      },
    });

    expect([400, 413]).toContain(response.statusCode);
    expect(mockCreateInformedConsentForContext).not.toHaveBeenCalled();
  });

  it("creates the consent for the calling context and answers 201", async () => {
    mockCreateInformedConsentForContext.mockResolvedValue({ id: "IC-1" });
    const payload = { patientId: "PAT-1", caseId: "CASE-1", file: validFile() };

    const response = await fastify.inject({
      method: "POST",
      url: "/2pq/informed-consents",
      payload,
    });

    expect(response.statusCode).toBe(201);
    expect(mockCreateInformedConsentForContext).toHaveBeenCalledWith(
      currentContext,
      payload,
    );
    expect(response.json()).toEqual({ record: { id: "IC-1" } });
  });

  it.each([null, 3])(
    "forwards an explicit patient draft revision expectation (%s)",
    async (expectedDraftRevision) => {
      currentContext = PATIENT;
      mockCreateInformedConsentForContext.mockResolvedValue({ id: "IC-1" });
      const payload = {
        flowMode: "direct" as const,
        expectedDraftRevision,
        file: validFile(),
      };

      const response = await fastify.inject({
        method: "POST",
        url: "/2pq/informed-consents",
        payload,
      });

      expect(response.statusCode).toBe(201);
      expect(mockCreateInformedConsentForContext).toHaveBeenCalledWith(
        PATIENT,
        payload,
      );
    },
  );

  it("requires every patient final upload to declare its draft revision expectation", async () => {
    currentContext = PATIENT;

    const response = await fastify.inject({
      method: "POST",
      url: "/2pq/informed-consents",
      payload: {
        flowMode: "direct",
        file: validFile(),
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Patient consent uploads require a draft revision expectation.",
    });
    expect(mockCreateInformedConsentForContext).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5])(
    "rejects an invalid final draft revision (%s)",
    async (expectedDraftRevision) => {
      currentContext = PATIENT;
      const response = await fastify.inject({
        method: "POST",
        url: "/2pq/informed-consents",
        payload: {
          flowMode: "direct",
          expectedDraftRevision,
          file: validFile(),
        },
      });

      expect(response.statusCode).toBe(400);
      expect(mockCreateInformedConsentForContext).not.toHaveBeenCalled();
    },
  );

  it("forwards the patient signature only for a guided upload", async () => {
    mockCreateInformedConsentForContext.mockResolvedValue({ id: "IC-1" });
    const payload = {
      patientId: "PAT-1",
      caseId: "CASE-1",
      flowMode: "guided",
      signatureAttestationAccepted: true,
      savedSignature,
      file: validFile(),
    };

    const response = await fastify.inject({
      method: "POST",
      url: "/2pq/informed-consents",
      payload,
    });

    expect(response.statusCode).toBe(201);
    expect(mockCreateInformedConsentForContext).toHaveBeenCalledWith(
      currentContext,
      payload,
    );
  });

  it.each([
    ["a guided upload without a signature", { flowMode: "guided" }],
    [
      "a direct upload with a signature",
      { flowMode: "direct", savedSignature },
    ],
    ["an unclassified upload with a signature", { savedSignature }],
    [
      "a direct upload with a signature attestation",
      { flowMode: "direct", signatureAttestationAccepted: true },
    ],
    [
      "an unclassified upload with a signature attestation",
      { signatureAttestationAccepted: true },
    ],
    [
      "a guided upload with a false signature attestation",
      {
        flowMode: "guided",
        savedSignature,
        signatureAttestationAccepted: false,
      },
    ],
  ])("rejects %s", async (_, uploadFields) => {
    const response = await fastify.inject({
      method: "POST",
      url: "/2pq/informed-consents",
      payload: {
        patientId: "PAT-1",
        ...uploadFields,
        file: validFile(),
      },
    });

    expect(response.statusCode).toBe(400);
    expect(mockCreateInformedConsentForContext).not.toHaveBeenCalled();
  });

  it("drops client-authored attestation audit metadata", async () => {
    mockCreateInformedConsentForContext.mockResolvedValue({ id: "IC-1" });
    const payload = {
      patientId: "PAT-1",
      flowMode: "guided",
      signatureAttestationAccepted: true,
      signatureAttestation: {
        accepted: true,
        acceptedAt: "2000-01-01T00:00:00.000Z",
        patientId: "PAT-OTHER",
        submittedByEmail: "attacker@example.com",
        surface: "patient_portal",
        statementVersion: "attacker-version",
        statement: "attacker statement",
      },
      savedSignature,
      file: validFile(),
    };

    const response = await fastify.inject({
      method: "POST",
      url: "/2pq/informed-consents",
      payload,
    });

    expect(response.statusCode).toBe(201);
    expect(mockCreateInformedConsentForContext).toHaveBeenCalledWith(
      currentContext,
      {
        patientId: "PAT-1",
        flowMode: "guided",
        signatureAttestationAccepted: true,
        savedSignature,
        file: validFile(),
      },
    );
  });

  it("surfaces a repository-side file type refusal as 400", async () => {
    mockCreateInformedConsentForContext.mockRejectedValue(
      new AdminRepositoryError("Unsupported informed consent file type.", 400),
    );

    const response = await fastify.inject({
      method: "POST",
      url: "/2pq/informed-consents",
      payload: {
        patientId: "PAT-1",
        file: { ...validFile(), type: "text/html", name: "x.html" },
      },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("GET /2pq/informed-consents/saved-signature", () => {
  const savedSignature =
    "data:image/png;base64," +
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";

  it("resolves a patient from context without a patientId query", async () => {
    currentContext = PATIENT;
    mockGetSavedInformedConsentSignatureForContext.mockResolvedValue({
      savedSignature,
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/2pq/informed-consents/saved-signature",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ savedSignature });
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(mockGetSavedInformedConsentSignatureForContext).toHaveBeenCalledWith(
      PATIENT,
      undefined,
    );
  });

  it("forwards one selected patientId for an authorized backoffice read", async () => {
    mockGetSavedInformedConsentSignatureForContext.mockResolvedValue({
      savedSignature: null,
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/2pq/informed-consents/saved-signature?patientId=PAT-1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ savedSignature: null });
    expect(mockGetSavedInformedConsentSignatureForContext).toHaveBeenCalledWith(
      currentContext,
      "PAT-1",
    );
  });

  it("passes through an unauthorized patient target", async () => {
    currentContext = PATIENT;
    mockGetSavedInformedConsentSignatureForContext.mockRejectedValue(
      new AdminRepositoryError(
        "Patients can only access their own saved signature.",
        403,
      ),
    );

    const response = await fastify.inject({
      method: "GET",
      url: "/2pq/informed-consents/saved-signature?patientId=PAT-OTHER",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "Patients can only access their own saved signature.",
    });
    expect(mockGetSavedInformedConsentSignatureForContext).toHaveBeenCalledWith(
      PATIENT,
      "PAT-OTHER",
    );
  });

  it("rejects a blank patientId before calling the repository", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/2pq/informed-consents/saved-signature?patientId=%20",
    });

    expect(response.statusCode).toBe(400);
    expect(
      mockGetSavedInformedConsentSignatureForContext,
    ).not.toHaveBeenCalled();
  });
});

describe("POST /2pq/informed-consents/email", () => {
  it("requires a patientId", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/2pq/informed-consents/email",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(mockSendInformedConsentEmailForContext).not.toHaveBeenCalled();
  });

  it("sends the email for the addressed patient", async () => {
    mockSendInformedConsentEmailForContext.mockResolvedValue({ sent: true });

    const response = await fastify.inject({
      method: "POST",
      url: "/2pq/informed-consents/email",
      payload: { patientId: "PAT-1" },
    });

    expect(response.statusCode).toBe(200);
    expect(mockSendInformedConsentEmailForContext).toHaveBeenCalledWith(
      currentContext,
      { patientId: "PAT-1" },
    );
  });
});

describe("GET /2pq/informed-consents/:consentId/file", () => {
  it("streams the file privately and neutralizes header-breaking filename characters", async () => {
    mockGetInformedConsentFileForContext.mockResolvedValue({
      name: 'evil"\r\nSet-Cookie: x=1.pdf',
      type: "application/pdf",
      bytes: Buffer.from("%PDF-1.7"),
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/2pq/informed-consents/IC-1/file",
    });

    expect(response.statusCode).toBe(200);
    expect(mockGetInformedConsentFileForContext).toHaveBeenCalledWith(
      currentContext,
      "IC-1",
    );
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.headers["set-cookie"]).toBeUndefined();
    const disposition = String(response.headers["content-disposition"]);
    expect(disposition).not.toMatch(/[\r\n]/);
    expect(disposition).toContain('filename="evil___Set-Cookie: x=1.pdf"');
    expect(response.rawPayload.toString()).toBe("%PDF-1.7");
  });
});

describe("PATCH /2pq/informed-consents/:consentId/case", () => {
  it("allows unlinking with caseId null", async () => {
    mockSetInformedConsentCaseForContext.mockResolvedValue({ id: "IC-1" });

    const response = await fastify.inject({
      method: "PATCH",
      url: "/2pq/informed-consents/IC-1/case",
      payload: { caseId: null },
    });

    expect(response.statusCode).toBe(200);
    expect(mockSetInformedConsentCaseForContext).toHaveBeenCalledWith(
      currentContext,
      "IC-1",
      null,
    );
  });

  it.each([{}, { caseId: "" }])("rejects body %j with 400", async (payload) => {
    const response = await fastify.inject({
      method: "PATCH",
      url: "/2pq/informed-consents/IC-1/case",
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(mockSetInformedConsentCaseForContext).not.toHaveBeenCalled();
  });
});

describe("DELETE /2pq/informed-consents/:consentId", () => {
  it("deletes the addressed consent as the calling context", async () => {
    mockDeleteInformedConsentForContext.mockResolvedValue({ deleted: true });

    const response = await fastify.inject({
      method: "DELETE",
      url: "/2pq/informed-consents/IC-1",
    });

    expect(response.statusCode).toBe(200);
    expect(mockDeleteInformedConsentForContext).toHaveBeenCalledWith(
      currentContext,
      "IC-1",
    );
  });

  it("maps a missing consent to 404", async () => {
    mockDeleteInformedConsentForContext.mockRejectedValue(
      new AdminRepositoryError("Informed consent not found.", 404),
    );

    const response = await fastify.inject({
      method: "DELETE",
      url: "/2pq/informed-consents/IC-404",
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("listing endpoints", () => {
  it("requires patientId for the cases listing", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/2pq/informed-consents/cases",
    });

    expect(response.statusCode).toBe(400);
    expect(mockListInformedConsentCasesForContext).not.toHaveBeenCalled();
  });

  it("passes context, patientId and cursor to the cases listing", async () => {
    mockListInformedConsentCasesForContext.mockResolvedValue({ cases: [] });

    await fastify.inject({
      method: "GET",
      url: "/2pq/informed-consents/cases?patientId=PAT-1&cursor=CASE-9",
    });

    expect(mockListInformedConsentCasesForContext).toHaveBeenCalledWith(
      currentContext,
      "PAT-1",
      "CASE-9",
    );
  });

  it("scopes the consent list to the calling context", async () => {
    currentContext = PATIENT;
    mockListInformedConsentsForContext.mockResolvedValue({ items: [] });

    const response = await fastify.inject({
      method: "GET",
      url: "/2pq/informed-consents",
    });

    expect(response.statusCode).toBe(200);
    expect(mockListInformedConsentsForContext).toHaveBeenCalledWith(
      PATIENT,
      undefined,
    );
  });
});
