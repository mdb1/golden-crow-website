import { redirect } from "next/navigation";
import { FileCode2, LockKeyhole, Server } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { Badge } from "@/components/ui/badge";
import { getAdminContextServer } from "@/lib/admin-context-server";

const endpoints = [
  {
    method: "GET",
    path: "/reporting/patients",
    summary: "Obtain the patient ID and patient data required to prepare a report.",
    auth: "Authorization: Bearer <REPORTING_API_TOKEN>",
    parameters: [
      {
        name: "patientId",
        in: "query",
        required: false,
        description: "Preferred lookup when the integration already knows the Firebase patient document ID.",
      },
      {
        name: "email",
        in: "query",
        required: false,
        description: "Normalized email lookup. Use only when patientId is not available.",
      },
      {
        name: "medicalRecordNumber",
        in: "query",
        required: false,
        description: "Clinical record lookup. Use only when patientId and email are not available.",
      },
    ],
    requestExample: `curl -X GET "https://golden-crow-sdk.vercel.app/reporting/patients?patientId=PAT-00001" \\
  -H "Authorization: Bearer <REPORTING_API_TOKEN>"`,
    responseExample: `{
  "patient": {
    "id": "PAT-00001",
    "institutionId": "INST-00001",
    "doctorId": "DOC-00001",
    "fullName": "Ada Lovelace",
    "email": "ada@example.com",
    "medicalRecordNumber": "MRN-1",
    "status": "active"
  }
}`,
  },
  {
    method: "POST",
    path: "/reporting/reports/uploaded",
    summary: "Notify PocketGenes after a report file has been uploaded to S3.",
    auth: "Authorization: Bearer <REPORTING_API_TOKEN>",
    parameters: [],
    bodyFields: [
      { name: "patientId", required: true, description: "Patient document ID returned by the lookup endpoint." },
      { name: "bucket", required: true, description: "S3 bucket where the report is stored." },
      { name: "key", required: true, description: "S3 object key for the report file." },
      { name: "reportId", required: false, description: "External report identifier. If omitted, the SDK generates one." },
      { name: "reportCode", required: false, description: "Stable report code. If omitted, it follows the generated report ID." },
      { name: "fileName", required: false, description: "Display file name for the uploaded report." },
      { name: "contentType", required: false, description: "Usually application/pdf." },
      { name: "size", required: false, description: "File size in bytes." },
      { name: "uploadedAt", required: false, description: "ISO timestamp for the external upload event." },
    ],
    requestExample: `curl -X POST "https://golden-crow-sdk.vercel.app/reporting/reports/uploaded" \\
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
    responseExample: `{
  "ok": true,
  "reportId": "aws-report-1",
  "reportCode": "REP-0001",
  "patientId": "PAT-00001",
  "status": "available"
}`,
  },
  {
    method: "GET",
    path: "/reporting/2pq/cases/{caseCode}",
    summary: "Return the current 2PQ case snapshot from a six-character case or sampling code.",
    auth: "Authorization: Bearer <REPORTING_API_TOKEN>",
    parameters: [
      {
        name: "caseCode",
        in: "path",
        required: true,
        description: "Exactly 6 letters or numbers, for example ABCXXX for the case or ABC001 for a sampling code.",
      },
    ],
    requestExample: `curl -X GET "https://golden-crow-sdk.vercel.app/reporting/2pq/cases/ABC001" \\
  -H "Authorization: Bearer <REPORTING_API_TOKEN>"`,
    responseExample: `{
  "caseSnapshot": {
    "code": "ABC001",
    "generatedAt": "2026-08-21T12:00:00.000Z",
    "main_case": {
      "id": "CASE-00001",
      "patient_id": "PAT-00001",
      "institution_id": "INST-00001",
      "doctor_id": "DOC-00001",
      "children_sampling_ids": ["SAMP-00001"],
      "last_updated": "2026-08-19T12:00:00.000Z"
    },
    "patient": {
      "id": "PAT-00001",
      "fullName": "Ada Lovelace",
      "email": "ada@example.com"
    },
    "entities": {
      "cases": [
        {
          "id": "CASE-00001",
          "kind": "case",
          "scope": {
            "institutionId": "INST-00001",
            "doctorId": "DOC-00001",
            "patientId": "PAT-00001"
          },
          "relations": {
            "samplingIds": ["SAMP-00001"]
          }
        }
      ],
      "samplings": [
        {
          "id": "SAMP-00001",
          "kind": "sampling",
          "identity": {
            "sampleId": "ABC001"
          },
          "relations": {
            "caseId": "CASE-00001"
          }
        }
      ]
    }
  }
}`,
  },
] as const;

function methodClassName(method: string) {
  if (method === "POST") {
    return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-300/30 dark:bg-amber-400/10 dark:text-amber-100";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-300/30 dark:bg-emerald-400/10 dark:text-emerald-100";
}

export default async function ReportingApiDocumentationPage() {
  const { role, isBootstrap } = await getAdminContextServer();

  if (role !== "full_admin" && !isBootstrap) {
    redirect("/2pq-dashboard");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="2PQ API"
        title="API documentation"
        description="Swagger-style reference for the reporting integration endpoints protected by REPORTING_API_TOKEN."
      />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Base contract</h2>
          </div>
          <div className="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
            <div>
              <p className="font-medium text-foreground">Base URL</p>
              <code className="mt-1 block overflow-x-auto rounded-md bg-muted px-2 py-1 text-xs text-foreground">
                https://golden-crow-sdk.vercel.app
              </code>
            </div>
            <div>
              <p className="font-medium text-foreground">Authentication</p>
              <code className="mt-1 block overflow-x-auto rounded-md bg-muted px-2 py-1 text-xs text-foreground">
                Authorization: Bearer &lt;REPORTING_API_TOKEN&gt;
              </code>
            </div>
            <div>
              <p className="font-medium text-foreground">Response format</p>
              <code className="mt-1 block overflow-x-auto rounded-md bg-muted px-2 py-1 text-xs text-foreground">
                application/json
              </code>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Auth errors</h2>
          </div>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <p>
              Missing SDK token configuration returns <code>503</code>.
            </p>
            <p>
              Missing or invalid bearer tokens return <code>401</code>.
            </p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <FileCode2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Endpoints</h2>
        </div>

        {endpoints.map((endpoint) => (
          <article
            key={`${endpoint.method}-${endpoint.path}`}
            className="rounded-lg border bg-card p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={methodClassName(endpoint.method)}
                  >
                    {endpoint.method}
                  </Badge>
                  <code className="break-all rounded-md bg-muted px-2 py-1 text-sm font-semibold text-foreground">
                    {endpoint.path}
                  </code>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {endpoint.summary}
                </p>
              </div>
              <Badge variant="secondary">Bearer token</Badge>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold">Request</h3>
                <div className="mt-3 rounded-lg border bg-muted/35 p-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Auth header
                  </p>
                  <code className="mt-1 block overflow-x-auto text-xs text-foreground">
                    {endpoint.auth}
                  </code>
                </div>

                {endpoint.parameters.length ? (
                  <div className="mt-3 overflow-hidden rounded-lg border">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Name</th>
                          <th className="px-3 py-2">In</th>
                          <th className="px-3 py-2">Required</th>
                          <th className="px-3 py-2">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {endpoint.parameters.map((parameter) => (
                          <tr key={parameter.name} className="border-t">
                            <td className="px-3 py-2 font-mono text-xs">
                              {parameter.name}
                            </td>
                            <td className="px-3 py-2">{parameter.in}</td>
                            <td className="px-3 py-2">
                              {parameter.required ? "Yes" : "No"}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {parameter.description}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {"bodyFields" in endpoint ? (
                  <div className="mt-3 overflow-hidden rounded-lg border">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Body field</th>
                          <th className="px-3 py-2">Required</th>
                          <th className="px-3 py-2">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {endpoint.bodyFields.map((field) => (
                          <tr key={field.name} className="border-t">
                            <td className="px-3 py-2 font-mono text-xs">
                              {field.name}
                            </td>
                            <td className="px-3 py-2">
                              {field.required ? "Yes" : "No"}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {field.description}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-4">
                <div>
                  <h3 className="text-sm font-semibold">Example request</h3>
                  <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-50">
                    <code>{endpoint.requestExample}</code>
                  </pre>
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Example response</h3>
                  <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-50">
                    <code>{endpoint.responseExample}</code>
                  </pre>
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
