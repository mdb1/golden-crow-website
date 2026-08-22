export type OpenApiParameter = {
  name?: string;
  in?: string;
  required?: boolean;
  description?: string;
};

export type OpenApiOperation = {
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    content?: Record<
      string,
      {
        example?: unknown;
      }
    >;
  };
  responses?: Record<
    string,
    {
      description?: string;
      content?: Record<
        string,
        {
          example?: unknown;
        }
      >;
    }
  >;
  "x-codeSamples"?: Array<{
    lang?: string;
    source?: string;
  }>;
};

export type OpenApiDocument = {
  openapi?: string;
  info?: {
    title?: string;
    version?: string;
    description?: string;
  };
  servers?: Array<{ url?: string }>;
  paths?: Record<string, Partial<Record<string, OpenApiOperation>>>;
};

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

export function buildReportingOpenApiDocument(serverUrl: string): OpenApiDocument {
  return {
    openapi: "3.1.0",
    info: {
      title: "GoldenCrow Public API",
      version: "1.0.0",
      description:
        "Public integration API for selected GoldenCrow workflows.",
    },
    servers: [{ url: serverUrl }],
    paths: {
      "/open-api/reporting/patients": {
        get: {
          tags: ["Reporting"],
          summary: "Look up a patient for report production.",
          description:
            "Returns the patient ID and scoped patient data needed by an external reporting workflow. Provide one lookup field.",
          parameters: [
            {
              name: "patientId",
              in: "query",
              required: false,
              description:
                "Preferred lookup when the integration already knows the Firebase patient document ID.",
            },
            {
              name: "email",
              in: "query",
              required: false,
              description: "Normalized email lookup.",
            },
            {
              name: "medicalRecordNumber",
              in: "query",
              required: false,
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
              source: `curl -X GET "${serverUrl}/open-api/reporting/patients?patientId=PAT-00001" \\
  -H "Authorization: Bearer <REPORTING_API_TOKEN>"`,
            },
          ],
        },
      },
      "/open-api/reporting/reports/uploaded": {
        post: {
          tags: ["Reporting"],
          summary: "Notify GoldenCrow that a report file is available.",
          description:
            "Creates or updates the uploaded report and report code records after the report file has been uploaded to external storage.",
          requestBody: {
            content: {
              "application/json": {
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
              source: `curl -X POST "${serverUrl}/open-api/reporting/reports/uploaded" \\
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
      "/open-api/reporting/2pq/cases/{caseCode}": {
        get: {
          tags: ["Reporting"],
          summary: "Look up the current 2PQ case by six-character code.",
          description:
            "Returns only the current case, its patient, and sampling records linked to that case. It does not include parent batch metadata or sibling cases.",
          parameters: [
            {
              name: "caseCode",
              in: "path",
              required: true,
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
              source: `curl -X GET "${serverUrl}/open-api/reporting/2pq/cases/ABC001" \\
  -H "Authorization: Bearer <REPORTING_API_TOKEN>"`,
            },
          ],
        },
      },
    },
  };
}
