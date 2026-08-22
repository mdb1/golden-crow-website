import {
  handleOAuthTokenExchange,
  handlePatientLookup,
  handleReportUploadNotification,
  handleTwoPQCaseLookup,
} from "@/lib/open-api/reporting-handlers";

const REPORTING_TOKEN = "rpt_access_test-token";

function authorizedRequest(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${REPORTING_TOKEN}`);

  return new Request(url, {
    ...init,
    headers,
  });
}

function mockSdkResponse(payload: unknown, status = 200) {
  (global.fetch as jest.Mock).mockResolvedValueOnce(
    Response.json(payload, { status }),
  );
}

function mockTokenVerification() {
  mockSdkResponse({
    ok: true,
    tokenType: "Bearer",
    expiresAt: "2026-08-22T12:00:00.000Z",
    quota: {
      limit: 60,
      remaining: 59,
      resetAt: "2026-08-21T12:01:00.000Z",
      windowSeconds: 60,
    },
  });
}

function expectTokenVerificationCall(index: number, endpoint: string) {
  const [url, init] = (global.fetch as jest.Mock).mock.calls[index];

  expect(url.toString()).toBe(
    "https://sdk.example.com/internal/openapi/reporting/tokens/verify",
  );
  expect(JSON.parse(init.body)).toMatchObject({
    token: REPORTING_TOKEN,
    endpoint,
  });
}

describe("public reporting OpenAPI handlers", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GOLDENCROW_OPENAPI_INTERNAL_TOKEN: "internal-openapi-secret",
      GOLDENCROW_SDK_URL: "https://sdk.example.com",
    };
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it("rejects reporting requests without an issued access token", async () => {
    const response = await handleTwoPQCaseLookup(
      new Request(
        "https://public.example.com/open-api/reporting/2pq/cases/ABC001",
      ),
      "ABC001",
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Missing reporting access token.");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("unwraps 2PQ case snapshots and preserves patient ids", async () => {
    mockTokenVerification();
    mockSdkResponse({
      caseSnapshot: {
        code: "ABC001",
        generatedAt: "2026-08-21T12:00:00.000Z",
        main_case: {
          id: "CASE-00001",
          patient_id: "PAT-00016",
          institution_id: "INST-00001",
          doctor_id: "DOC-00001",
          children_sampling_ids: ["SAMP-00001"],
          last_updated: "2026-08-19T12:00:00.000Z",
        },
        patient: {
          id: "PAT-00016",
          fullName: "Ada Lovelace",
          email: "ada@example.com",
        },
        entities: {
          cases: [
            {
              id: "CASE-00001",
              kind: "case",
              scope: {
                institutionId: "INST-00001",
                doctorId: "DOC-00001",
                patientId: "PAT-00016",
              },
            },
          ],
          samplings: [
            {
              id: "SAMP-00001",
              kind: "sampling",
              identity: {
                sampleId: "ABC001",
              },
            },
          ],
        },
      },
    });

    const response = await handleTwoPQCaseLookup(
      authorizedRequest(
        "https://public.example.com/open-api/reporting/2pq/cases/ABC001",
      ),
      "ABC001",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.caseSnapshot).toBeUndefined();
    expect(body.code).toBe("ABC001");
    expect(body.main_case.patient_id).toBe("PAT-00016");
    expect(body.patient.id).toBe("PAT-00016");
    expect(body.entities.cases[0].scope.patientId).toBe("PAT-00016");
    expectTokenVerificationCall(0, "/open-api/reporting/2pq/cases/{caseCode}");
    expect((global.fetch as jest.Mock).mock.calls[1][0].toString()).toBe(
      "https://sdk.example.com/internal/openapi/reporting/2pq/cases/ABC001",
    );
  });

  it("looks up patients by patientId and returns the patient fields directly", async () => {
    mockTokenVerification();
    mockSdkResponse({
      patient: {
        id: "PAT-00016",
        institutionId: "INST-00001",
        doctorId: "DOC-00001",
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        status: "active",
      },
    });

    const lookupResponse = await handlePatientLookup(
      authorizedRequest(
        "https://public.example.com/open-api/reporting/patients?patientId=PAT-00016",
      ),
    );
    const lookupBody = await lookupResponse.json();

    expect(lookupBody.patient).toBeUndefined();
    expect(lookupBody.id).toBe("PAT-00016");
    expect(lookupBody.fullName).toBe("Ada Lovelace");
    expectTokenVerificationCall(0, "/open-api/reporting/patients");
    expect((global.fetch as jest.Mock).mock.calls[1][0].toString()).toBe(
      "https://sdk.example.com/internal/openapi/reporting/patients?patientId=PAT-00016",
    );
  });

  it("rejects patient lookups by email or medical record number", async () => {
    mockTokenVerification();
    mockTokenVerification();

    const emailResponse = await handlePatientLookup(
      authorizedRequest(
        "https://public.example.com/open-api/reporting/patients?email=ada%40example.com",
      ),
    );
    const emailBody = await emailResponse.json();

    expect(emailResponse.status).toBe(400);
    expect(emailBody.error).toBe("Only patientId lookup is supported.");

    const medicalRecordResponse = await handlePatientLookup(
      authorizedRequest(
        "https://public.example.com/open-api/reporting/patients?medicalRecordNumber=MRN-1",
      ),
    );
    const medicalRecordBody = await medicalRecordResponse.json();

    expect(medicalRecordResponse.status).toBe(400);
    expect(medicalRecordBody.error).toBe("Only patientId lookup is supported.");
    expectTokenVerificationCall(0, "/open-api/reporting/patients");
    expectTokenVerificationCall(1, "/open-api/reporting/patients");
  });

  it("accepts only caseCode for upload notifications and derives the internal SDK payload", async () => {
    mockTokenVerification();
    mockSdkResponse({
      caseSnapshot: {
        code: "ABC001",
        main_case: {
          id: "CASE-00001",
          patient_id: "PAT-00016",
        },
        patient: {
          id: "PAT-00016",
          fullName: "Ada Lovelace",
          email: "ada@example.com",
        },
      },
    });

    mockSdkResponse(
      {
        ok: true,
        reportId: "2pq-abc001",
        reportCode: "ABC001",
        patientId: "PAT-00016",
        status: "available",
      },
      201,
    );

    const uploadResponse = await handleReportUploadNotification(
      authorizedRequest(
        "https://public.example.com/open-api/reporting/reports/upload",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            caseCode: "abc001",
          }),
        },
      ),
    );
    const uploadBody = await uploadResponse.json();
    const internalUploadBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[2][1].body,
    );

    expect(uploadResponse.status).toBe(201);
    expect(uploadBody.patientId).toBe("PAT-00016");
    expect(uploadBody.caseCode).toBe("ABC001");
    expectTokenVerificationCall(0, "/open-api/reporting/reports/upload");
    expect((global.fetch as jest.Mock).mock.calls[1][0].toString()).toBe(
      "https://sdk.example.com/internal/openapi/reporting/2pq/cases/ABC001",
    );
    expect((global.fetch as jest.Mock).mock.calls[2][0].toString()).toBe(
      "https://sdk.example.com/internal/openapi/reporting/reports/upload",
    );
    expect(internalUploadBody.patientId).toBe("PAT-00016");
    expect(internalUploadBody.reportId).toBe("2pq-abc001");
    expect(internalUploadBody.reportCode).toBe("ABC001");
    expect(internalUploadBody.bucket).toBe("goldencrow-reporting-reports");
    expect(internalUploadBody.key).toBe("reports/2pq/ABC001.pdf");
    expect(internalUploadBody.contentType).toBe("application/pdf");
    expect(internalUploadBody.reportType).toBe("2pq");
    expect(internalUploadBody.sampleId).toBe("ABC001");
  });

  it("rejects upload notification bodies with fields other than caseCode", async () => {
    mockTokenVerification();

    const response = await handleReportUploadNotification(
      authorizedRequest(
        "https://public.example.com/open-api/reporting/reports/upload",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            caseCode: "ABC001",
            bucket: "reports-bucket",
          }),
        },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Unrecognized key");
    expectTokenVerificationCall(0, "/open-api/reporting/reports/upload");
  });

  it("exchanges client credentials for a reporting access token", async () => {
    mockSdkResponse({
      access_token: "rpt_access_exchange-token",
      token_type: "Bearer",
      expires_in: 86400,
      scope: "reporting:read reporting:write",
    });

    const requestBody = {
      grant_type: "client_credentials",
      client_id: "gci_live_client",
      client_secret: "gcs_live_secret",
    } as const;
    const response = await handleOAuthTokenExchange(
      new Request("https://public.example.com/open-api/oauth/token", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      access_token: "rpt_access_exchange-token",
      token_type: "Bearer",
      expires_in: 86400,
      scope: "reporting:read reporting:write",
    });
    expect((global.fetch as jest.Mock).mock.calls[0][0].toString()).toBe(
      "https://sdk.example.com/internal/openapi/oauth/token",
    );
    expect(
      JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body),
    ).toEqual(requestBody);
  });
});
