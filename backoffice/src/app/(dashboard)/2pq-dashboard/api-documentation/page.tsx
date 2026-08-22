import { redirect } from "next/navigation";
import { FileCode2, LockKeyhole, Server } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { ReportingApiTokenReveal } from "@/components/reporting-api-token-reveal";
import { Badge } from "@/components/ui/badge";
import { getAdminContextServer } from "@/lib/admin-context-server";
import {
  buildReportingOpenApiDocument,
} from "@/lib/reporting-openapi-contract";
import type {
  OpenApiDocument,
  OpenApiOperation,
} from "@/lib/reporting-openapi-contract";
import { getReportingApiToken } from "@/lib/reporting-api-token";

const DEFAULT_OPENAPI_URL = "https://goldencrow-openapi.vercel.app";
const METHOD_ORDER = ["get", "post", "put", "patch", "delete"] as const;

function resolveOpenApiBaseUrl() {
  return (
    process.env.GOLDENCROW_OPENAPI_URL?.replace(/\/+$/, "") ||
    process.env.NEXT_PUBLIC_GOLDENCROW_OPENAPI_URL?.replace(/\/+$/, "") ||
    DEFAULT_OPENAPI_URL
  );
}

async function fetchOpenApiDocument(baseUrl: string) {
  try {
    const response = await fetch(`${baseUrl}/openapi.json`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as OpenApiDocument;
  } catch {
    return null;
  }
}

function methodClassName(method: string) {
  if (method === "POST") {
    return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-300/30 dark:bg-amber-400/10 dark:text-amber-100";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-300/30 dark:bg-emerald-400/10 dark:text-emerald-100";
}

function publicOperations(document: OpenApiDocument | null) {
  return Object.entries(document?.paths ?? {}).flatMap(([path, pathItem]) => {
    if (!path.startsWith("/v1/")) {
      return [];
    }

    return METHOD_ORDER.flatMap((method) => {
      const operation = pathItem[method];
      return operation
        ? [
            {
              method: method.toUpperCase(),
              path,
              operation,
            },
          ]
        : [];
    });
  });
}

function firstJsonExample(operation: OpenApiOperation) {
  const preferredStatus = operation.responses?.["200"]
    ? "200"
    : operation.responses?.["201"]
      ? "201"
      : Object.keys(operation.responses ?? {})[0];
  const response = preferredStatus
    ? operation.responses?.[preferredStatus]
    : undefined;
  return response?.content?.["application/json"]?.example;
}

function requestJsonExample(operation: OpenApiOperation) {
  return operation.requestBody?.content?.["application/json"]?.example;
}

function stringifyExample(value: unknown) {
  if (value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function firstCodeSample(operation: OpenApiOperation) {
  return operation["x-codeSamples"]?.find((sample) => sample.source)?.source;
}

export default async function ReportingApiDocumentationPage() {
  const { role, isBootstrap } = await getAdminContextServer();

  if (role !== "full_admin" && !isBootstrap) {
    redirect("/2pq-dashboard");
  }

  const baseUrl = resolveOpenApiBaseUrl();
  const fetchedDocument = await fetchOpenApiDocument(baseUrl);
  const document = fetchedDocument ?? buildReportingOpenApiDocument(baseUrl);
  const operations = publicOperations(document);
  const reportingApiToken = getReportingApiToken();

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="2PQ API"
        title="API documentation"
        description="Swagger-style reference rendered from the GoldenCrow public OpenAPI contract."
      />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Public API contract</h2>
          </div>
          <div className="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
            <div>
              <p className="font-medium text-foreground">Base URL</p>
              <code className="mt-1 block overflow-x-auto rounded-md bg-muted px-2 py-1 text-xs text-foreground">
                {document?.servers?.[0]?.url ?? baseUrl}
              </code>
            </div>
            <div>
              <p className="font-medium text-foreground">OpenAPI source</p>
              <code className="mt-1 block overflow-x-auto rounded-md bg-muted px-2 py-1 text-xs text-foreground">
                {fetchedDocument ? `${baseUrl}/openapi.json` : "Bundled contract"}
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
            <h2 className="text-base font-semibold">Authentication</h2>
          </div>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <p>
              Public reporting endpoints use{" "}
              <code>Authorization: Bearer &lt;REPORTING_API_TOKEN&gt;</code>.
            </p>
            <p>
              Internal SDK bridge tokens are not part of the public API
              contract.
            </p>
          </div>
          <ReportingApiTokenReveal token={reportingApiToken} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <FileCode2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Public endpoints</h2>
          {document?.info?.version ? (
            <Badge variant="secondary">v{document.info.version}</Badge>
          ) : null}
        </div>

        {operations.map(({ method, path, operation }) => {
          const requestExample = requestJsonExample(operation);
          const responseExample = firstJsonExample(operation);
          const codeSample = firstCodeSample(operation);

          return (
            <article
              key={`${method}-${path}`}
              className="rounded-lg border bg-card p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={methodClassName(method)}
                    >
                      {method}
                    </Badge>
                    <code className="break-all rounded-md bg-muted px-2 py-1 text-sm font-semibold text-foreground">
                      {path}
                    </code>
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">
                    {operation.summary}
                  </p>
                  {operation.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {operation.description}
                    </p>
                  ) : null}
                </div>
                <Badge variant="secondary">
                  {operation.tags?.[0] ?? "Public API"}
                </Badge>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold">Request</h3>
                  <div className="mt-3 rounded-lg border bg-muted/35 p-3">
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      Auth header
                    </p>
                    <code className="mt-1 block overflow-x-auto text-xs text-foreground">
                      Authorization: Bearer &lt;REPORTING_API_TOKEN&gt;
                    </code>
                  </div>

                  {operation.parameters?.length ? (
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
                          {operation.parameters.map((parameter) => (
                            <tr
                              key={`${parameter.in}-${parameter.name}`}
                              className="border-t"
                            >
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

                  {requestExample !== undefined ? (
                    <div className="mt-4">
                      <h3 className="text-sm font-semibold">JSON body</h3>
                      <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-50">
                        <code>{stringifyExample(requestExample)}</code>
                      </pre>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-4">
                  {codeSample ? (
                    <div>
                      <h3 className="text-sm font-semibold">Example request</h3>
                      <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-50">
                        <code>{codeSample}</code>
                      </pre>
                    </div>
                  ) : null}
                  {responseExample !== undefined ? (
                    <div>
                      <h3 className="text-sm font-semibold">
                        Example response
                      </h3>
                      <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-50">
                        <code>{stringifyExample(responseExample)}</code>
                      </pre>
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
