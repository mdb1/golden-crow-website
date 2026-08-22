type JsonSchema = Record<string, unknown>;

function reportingBearerSecurity() {
  return [{ ReportingBearerAuth: [] }];
}

function jsonResponse(description: string, example: unknown) {
  return {
    description,
    content: {
      "application/json": {
        example,
      },
    },
  };
}

function errorResponses() {
  return {
    "401": jsonResponse("Invalid or missing reporting token.", {
      error: "Invalid reporting API token",
    }),
    "503": jsonResponse("The API is missing required runtime configuration.", {
      error: "Reporting API token is not configured",
    }),
  };
}

const patientSchema: JsonSchema = {
  type: "object",
  required: ["id", "institutionId", "doctorId", "fullName", "email", "status"],
  properties: {
    id: { type: "string" },
    institutionId: { type: "string" },
    doctorId: { type: "string" },
    fullName: { type: "string" },
    email: { type: "string", format: "email" },
    medicalRecordNumber: { type: "string" },
    birthDate: { type: "string" },
    sex: { type: "string" },
    status: { type: "string", enum: ["active", "inactive"] },
    notes: { type: "string" },
    additionalInformation: { type: "object", additionalProperties: true },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
};

const uploadedReportBodySchema: JsonSchema = {
  type: "object",
  required: ["patientId", "bucket", "key"],
  properties: {
    patientId: { type: "string" },
    reportId: { type: "string" },
    reportCode: { type: "string" },
    bucket: { type: "string" },
    key: { type: "string" },
    fileName: { type: "string" },
    contentType: { type: "string" },
    size: { type: "number", minimum: 0 },
    uploadedAt: { type: "string", format: "date-time" },
    providerName: { type: "string" },
    providerFormat: { type: "string" },
    reportType: { type: "string" },
    sampleId: { type: "string" },
    downloadUrl: { type: "string", format: "uri" },
  },
};

const twoPQCaseSnapshotSchema: JsonSchema = {
  type: "object",
  required: ["code", "generatedAt", "main_case", "entities"],
  properties: {
    code: { type: "string" },
    generatedAt: { type: "string", format: "date-time" },
    main_case: {
      type: "object",
      required: [
        "id",
        "patient_id",
        "institution_id",
        "doctor_id",
        "children_sampling_ids",
      ],
      properties: {
        id: { type: "string" },
        patient_id: { type: ["string", "null"] },
        institution_id: { type: ["string", "null"] },
        doctor_id: { type: ["string", "null"] },
        children_sampling_ids: {
          type: "array",
          items: { type: "string" },
        },
        last_updated: { type: ["string", "null"] },
      },
    },
    patient: { anyOf: [patientSchema, { type: "null" }] },
    institution: { type: ["object", "null"], additionalProperties: true },
    doctor: { type: ["object", "null"], additionalProperties: true },
    entities: {
      type: "object",
      required: ["cases", "samplings"],
      properties: {
        cases: { type: "array", items: { type: "object" } },
        samplings: { type: "array", items: { type: "object" } },
      },
    },
  },
};

export function buildOpenApiDocument(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "GoldenCrow Public API",
      version: "1.0.0",
      description:
        "Public integration API for selected GoldenCrow workflows. This service owns the external contract and delegates Firebase work to the internal goldencrow-sdk layer.",
    },
    servers: [{ url: serverUrl }],
    tags: [
      {
        name: "Reporting",
        description: "External report production and delivery integration.",
      },
    ],
    components: {
      securitySchemes: {
        ReportingBearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "REPORTING_API_TOKEN",
          description:
            "Use the reporting token issued by a GoldenCrow full admin.",
        },
      },
      schemas: {
        ReportingPatient: patientSchema,
        UploadedReportNotification: uploadedReportBodySchema,
        TwoPQCaseSnapshot: twoPQCaseSnapshotSchema,
      },
    },
    paths: {
      "/v1/reporting/patients": {
        get: {
          tags: ["Reporting"],
          operationId: "getReportingPatient",
          summary: "Look up a patient for report production.",
          description:
            "Returns the patient ID and scoped patient data needed by an external reporting workflow. Provide one lookup field.",
          security: reportingBearerSecurity(),
          parameters: [
            {
              name: "patientId",
              in: "query",
              required: false,
              schema: { type: "string" },
              description:
                "Preferred lookup when the integration already knows the Firebase patient document ID.",
            },
            {
              name: "email",
              in: "query",
              required: false,
              schema: { type: "string", format: "email" },
              description: "Normalized email lookup.",
            },
            {
              name: "medicalRecordNumber",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Clinical record lookup.",
            },
          ],
          responses: {
            "200": jsonResponse("Patient found.", {
              patient: {
                id: "PAT-00001",
                institutionId: "INST-00001",
                doctorId: "DOC-00001",
                fullName: "Ada Lovelace",
                email: "ada@example.com",
                medicalRecordNumber: "MRN-1",
                status: "active",
              },
            }),
            "400": jsonResponse("No lookup field was provided.", {
              error: "Provide patientId, email, or medicalRecordNumber.",
            }),
            "404": jsonResponse("Patient not found.", {
              error: "Patient not found.",
            }),
            ...errorResponses(),
          },
          "x-codeSamples": [
            {
              lang: "curl",
              source: `curl -X GET "${serverUrl}/v1/reporting/patients?patientId=PAT-00001" \\
  -H "Authorization: Bearer <REPORTING_API_TOKEN>"`,
            },
          ],
        },
      },
      "/v1/reporting/reports/uploaded": {
        post: {
          tags: ["Reporting"],
          operationId: "notifyUploadedReport",
          summary: "Notify GoldenCrow that a report file is available.",
          description:
            "Creates or updates the uploaded report and report code records after the report file has been uploaded to external storage.",
          security: reportingBearerSecurity(),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: uploadedReportBodySchema,
                example: {
                  patientId: "PAT-00001",
                  reportCode: "REP-0001",
                  bucket: "reports-bucket",
                  key: "reports/PAT-00001/REP-0001.pdf",
                  contentType: "application/pdf",
                  uploadedAt: "2026-08-19T12:30:00.000Z",
                },
              },
            },
          },
          responses: {
            "201": jsonResponse("Upload notification accepted.", {
              ok: true,
              reportId: "aws-report-1",
              reportCode: "REP-0001",
              patientId: "PAT-00001",
              status: "available",
            }),
            "400": jsonResponse("Invalid upload notification.", {
              error: "bucket is required.",
            }),
            "404": jsonResponse("Patient not found.", {
              error: "Patient not found.",
            }),
            ...errorResponses(),
          },
          "x-codeSamples": [
            {
              lang: "curl",
              source: `curl -X POST "${serverUrl}/v1/reporting/reports/uploaded" \\
  -H "Authorization: Bearer <REPORTING_API_TOKEN>" \\
  -H "Content-Type: application/json" \\
  --data '{
    "patientId": "PAT-00001",
    "reportCode": "REP-0001",
    "bucket": "reports-bucket",
    "key": "reports/PAT-00001/REP-0001.pdf",
    "contentType": "application/pdf",
    "uploadedAt": "2026-08-19T12:30:00.000Z"
  }'`,
            },
          ],
        },
      },
      "/v1/reporting/2pq/cases/{caseCode}": {
        get: {
          tags: ["Reporting"],
          operationId: "getTwoPQCaseSnapshot",
          summary: "Look up the current 2PQ case by six-character code.",
          description:
            "Returns only the current case, its patient, and sampling records linked to that case. It does not include parent batch metadata or sibling cases.",
          security: reportingBearerSecurity(),
          parameters: [
            {
              name: "caseCode",
              in: "path",
              required: true,
              schema: {
                type: "string",
                pattern: "^[A-Za-z0-9]{6}$",
                example: "ABC001",
              },
              description:
                "Exactly 6 letters or numbers, for example ABCXXX for the case or ABC001 for a sampling code.",
            },
          ],
          responses: {
            "200": jsonResponse("2PQ case snapshot found.", {
              caseSnapshot: {
                code: "ABC001",
                generatedAt: "2026-08-21T12:00:00.000Z",
                main_case: {
                  id: "CASE-00001",
                  patient_id: "PAT-00001",
                  institution_id: "INST-00001",
                  doctor_id: "DOC-00001",
                  children_sampling_ids: ["SAMP-00001"],
                  last_updated: "2026-08-19T12:00:00.000Z",
                },
                patient: {
                  id: "PAT-00001",
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
                        patientId: "PAT-00001",
                      },
                      relations: {
                        samplingIds: ["SAMP-00001"],
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
                      relations: {
                        caseId: "CASE-00001",
                      },
                    },
                  ],
                },
              },
            }),
            "400": jsonResponse("Invalid six-character code.", {
              error: "caseCode must contain exactly 6 letters or numbers.",
            }),
            "404": jsonResponse("2PQ case not found.", {
              error: "2PQ case not found.",
            }),
            ...errorResponses(),
          },
          "x-codeSamples": [
            {
              lang: "curl",
              source: `curl -X GET "${serverUrl}/v1/reporting/2pq/cases/ABC001" \\
  -H "Authorization: Bearer <REPORTING_API_TOKEN>"`,
            },
          ],
        },
      },
    },
  };
}
