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
  "x-parameterNote"?: string;
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
    "401": jsonResponse("Invalid, missing, expired, or revoked access token.", {
      error: "Invalid reporting access token.",
    }),
    "429": jsonResponse("The integration client exceeded its request quota.", {
      error: "Client quota exceeded.",
    }),
  };
}

const EXAMPLE_PATIENT_ID = "PAT-8F4K2Z9Q1M7X5C3V6B0N2R8T4Y1L9P5WA7D2";
const EXAMPLE_CLIENT_ID = "gci_live_7zZKqYxG5bC2mR9wL4pN8tV1sH6aJ3dF";
const EXAMPLE_CLIENT_SECRET = "gcs_live_Qn4xV9mL2pT7sA5kC8wR1yH6dE3jB0uZ";
const EXAMPLE_ACCESS_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJnb2xkZW5jcm93LW9wZW5hcGkiLCJhdWQiOiJnb2xkZW5jcm93LXJlcG9ydGluZy1hcGkiLCJzdWIiOiJnY2lfbGl2ZV83elpLcVl4RzViQzJtUjl3TDRwTjh0VjFzSDZhSjNkRiIsImNsaWVudF9pZCI6ImdjaV9saXZlXzd6WktxWXhHNWJDMm1SOXdMNHBOOHRWMXNINmFKM2RGIiwic2NvcGUiOiJyZXBvcnRpbmc6cmVhZCByZXBvcnRpbmc6d3JpdGUiLCJ0b2tlbl91c2UiOiJyZXBvcnRpbmciLCJpYXQiOjE3ODc0Mjg4MDAsIm5iZiI6MTc4NzQyODgwMCwiZXhwIjoxNzg3NTE1MjAwLCJqdGkiOiJleGFtcGxlLXRva2VuLWlkIn0.HF8dZ6PO0xrKpEJ5Npwz8YC3ab4aDUbj_AYA5D-4EMs";

export function buildReportingOpenApiDocument(
  serverUrl: string,
): OpenApiDocument {
  return {
    openapi: "3.1.0",
    info: {
      title: "GoldenCrow Public API",
      version: "1.0.0",
      description: "Public integration API for selected GoldenCrow workflows.",
    },
    servers: [{ url: serverUrl }],
    paths: {
      "/open-api/oauth/token": {
        post: {
          tags: ["Auth"],
          summary: "Exchange client credentials for an access token.",
          description:
            "Returns a 24-hour JWT bearer access token for a registered integration client. The token includes standard iat, nbf, and exp claims so the integration can inspect expiration before making API calls. No refresh token is issued; request a new access token with the same client credentials when the current token expires.",
          requestBody: {
            content: {
              "application/json": {
                example: {
                  grant_type: "client_credentials",
                  client_id: EXAMPLE_CLIENT_ID,
                  client_secret: EXAMPLE_CLIENT_SECRET,
                },
              },
            },
          },
          responses: {
            "200": jsonResponse("Access token issued.", {
              access_token: EXAMPLE_ACCESS_TOKEN,
              token_type: "Bearer",
              expires_in: 86400,
              scope: "reporting:read reporting:write",
            }),
            "400": jsonResponse("Invalid token request.", {
              error: "Unsupported grant_type.",
            }),
            "401": jsonResponse("Invalid client credentials.", {
              error: "Invalid client credentials.",
            }),
          },
          "x-codeSamples": [
            {
              lang: "curl",
              source: `curl -X POST "${serverUrl}/open-api/oauth/token" \\
  -H "Content-Type: application/json" \\
  --data '{
    "grant_type": "client_credentials",
    "client_id": "${EXAMPLE_CLIENT_ID}",
    "client_secret": "${EXAMPLE_CLIENT_SECRET}"
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
              code: "ABC001",
              generatedAt: "2026-08-21T12:00:00.000Z",
              main_case: {
                id: "CASE-00001",
                patient_id: EXAMPLE_PATIENT_ID,
                institution_id: "INST-00001",
                doctor_id: "DOC-00001",
                children_sampling_ids: ["SAMP-00001"],
                last_updated: "2026-08-19T12:00:00.000Z",
              },
              patient: {
                id: EXAMPLE_PATIENT_ID,
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
                      patientId: EXAMPLE_PATIENT_ID,
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
  -H "Authorization: Bearer <access_token>"`,
            },
          ],
        },
      },
      "/open-api/reporting/patients": {
        get: {
          tags: ["Reporting"],
          summary: "Look up a patient for report production.",
          description:
            "Returns the patient ID and scoped patient data needed by an external reporting workflow.",
          parameters: [
            {
              name: "caseCode",
              in: "query",
              required: false,
              description:
                "Exactly 6 letters or numbers, for example ABCXXX for the case or ABC001 for a sampling code.",
            },
            {
              name: "patientId",
              in: "query",
              required: false,
              description: "GoldenCrow patient ID.",
            },
          ],
          "x-parameterNote":
            "Send either caseCode or patientId. One of them is required for this lookup to work.",
          responses: {
            "200": jsonResponse("Patient found.", {
              id: EXAMPLE_PATIENT_ID,
              institutionId: "INST-00001",
              doctorId: "DOC-00001",
              fullName: "Ada Lovelace",
              email: "ada@example.com",
              medicalRecordNumber: "MRN-1",
              status: "active",
            }),
            "400": jsonResponse("patientId or caseCode was not provided.", {
              error: "Provide patientId or caseCode.",
            }),
            "404": jsonResponse("Patient not found.", {
              error: "Patient not found.",
            }),
            ...errorResponses(),
          },
          "x-codeSamples": [
            {
              lang: "curl",
              source: `# Lookup by caseCode
curl -X GET "${serverUrl}/open-api/reporting/patients?caseCode=ABC001" \\
  -H "Authorization: Bearer <access_token>"

# Lookup by patientId
curl -X GET "${serverUrl}/open-api/reporting/patients?patientId=${EXAMPLE_PATIENT_ID}" \\
  -H "Authorization: Bearer <access_token>"`,
            },
          ],
        },
      },
      "/open-api/reporting/reports/upload": {
        post: {
          tags: ["Reporting"],
          summary: "Notify GoldenCrow that a 2PQ report file is available.",
          description:
            "Creates or updates the uploaded report and report code records for the current 2PQ case.",
          requestBody: {
            content: {
              "application/json": {
                example: {
                  caseCode: "ABC001",
                  download_url: "https://reports.example.com/ABC001.pdf",
                },
              },
            },
          },
          responses: {
            "201": jsonResponse("Upload notification accepted.", {
              ok: true,
              reportId: "2pq-abc001",
              reportCode: "ABC001",
              caseCode: "ABC001",
              patientId: EXAMPLE_PATIENT_ID,
              status: "available",
            }),
            "400": jsonResponse("Invalid upload notification.", {
              error: "caseCode must contain exactly 6 letters or numbers.",
            }),
            "404": jsonResponse("2PQ case or patient not found.", {
              error: "2PQ case not found.",
            }),
            ...errorResponses(),
          },
          "x-codeSamples": [
            {
              lang: "curl",
              source: `curl -X POST "${serverUrl}/open-api/reporting/reports/upload" \\
  -H "Authorization: Bearer <access_token>" \\
  -H "Content-Type: application/json" \\
  --data '{
    "caseCode": "ABC001",
    "download_url": "https://reports.example.com/ABC001.pdf"
  }'`,
            },
          ],
        },
      },
    },
  };
}
