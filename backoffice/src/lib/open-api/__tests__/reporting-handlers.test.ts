import {
  handlePatientLookup,
  handleTwoPQCaseLookup,
  handleUploadedReportNotification,
} from "@/lib/open-api/reporting-handlers";

const REPORTING_TOKEN = "test-reporting-token";

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

describe("public reporting OpenAPI handlers", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      BACKOFFICE_REPORTING_API_TOKEN: REPORTING_TOKEN,
      GOLDENCROW_OPENAPI_INTERNAL_TOKEN: "internal-openapi-secret",
      GOLDENCROW_PATIENT_REF_SECRET: "patient-ref-secret",
      GOLDENCROW_SDK_URL: "https://sdk.example.com",
    };
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it("unwraps 2PQ case snapshots and redacts sequential patient ids", async () => {
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
    expect(body.main_case.patient_id).toBeUndefined();
    expect(body.patient.id).toBeUndefined();
    expect(body.entities.cases[0].scope.patientId).toBeUndefined();
    expect(body.main_case.patient_ref).toMatch(/^gcp_/);
    expect(body.patient.patientRef).toBe(body.main_case.patient_ref);
    expect(body.entities.cases[0].scope.patientRef).toBe(
      body.main_case.patient_ref,
    );
    expect(JSON.stringify(body)).not.toContain("PAT-00016");
  });

  it("returns patientRef publicly and sends raw patient id only to the internal SDK bridge", async () => {
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
        "https://public.example.com/open-api/reporting/patients?email=ada%40example.com",
      ),
    );
    const lookupBody = await lookupResponse.json();
    const patientRef = lookupBody.patient.patientRef;

    expect(lookupBody.patient.id).toBeUndefined();
    expect(patientRef).toMatch(/^gcp_/);
    expect(JSON.stringify(lookupBody)).not.toContain("PAT-00016");

    mockSdkResponse(
      {
        ok: true,
        reportId: "aws-report-1",
        reportCode: "REP-0001",
        patientId: "PAT-00016",
        status: "available",
      },
      201,
    );

    const uploadResponse = await handleUploadedReportNotification(
      authorizedRequest(
        "https://public.example.com/open-api/reporting/reports/uploaded",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            patientRef,
            reportCode: "REP-0001",
            bucket: "reports-bucket",
            key: "reports/REP-0001.pdf",
          }),
        },
      ),
    );
    const uploadBody = await uploadResponse.json();
    const internalUploadBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[1][1].body,
    );

    expect(uploadResponse.status).toBe(201);
    expect(uploadBody.patientId).toBeUndefined();
    expect(uploadBody.patientRef).toBe(patientRef);
    expect(JSON.stringify(uploadBody)).not.toContain("PAT-00016");
    expect(internalUploadBody.patientId).toBe("PAT-00016");
    expect(internalUploadBody.patientRef).toBeUndefined();
  });
});
