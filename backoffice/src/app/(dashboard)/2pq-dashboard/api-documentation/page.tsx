import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FileCode2 } from "lucide-react";
import { ApiCodeDisplay } from "@/components/api-code-display";
import { PageHero } from "@/components/page-hero";
import { Badge } from "@/components/ui/badge";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { buildReportingOpenApiDocument } from "@/lib/reporting-openapi-contract";
import type {
  OpenApiDocument,
  OpenApiOperation,
} from "@/lib/reporting-openapi-contract";

const DEFAULT_OPENAPI_URL = "https://golden-crow-backoffice.vercel.app";
const METHOD_ORDER = ["get", "post", "put", "patch", "delete"] as const;

function resolveOpenApiBaseUrl(
  headerStore: Awaited<ReturnType<typeof headers>>,
) {
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  if (!host) {
    return DEFAULT_OPENAPI_URL;
  }

  const protocol =
    headerStore.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  return `${protocol}://${host}`.replace(/\/+$/, "");
}

function methodClassName(method: string) {
  if (method === "POST") {
    return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-300/30 dark:bg-amber-400/10 dark:text-amber-100";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-300/30 dark:bg-emerald-400/10 dark:text-emerald-100";
}

function publicOperations(document: OpenApiDocument | null) {
  return Object.entries(document?.paths ?? {}).flatMap(([path, pathItem]) => {
    if (!path.startsWith("/open-api/")) {
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

  const baseUrl = resolveOpenApiBaseUrl(await headers());
  const document = buildReportingOpenApiDocument(baseUrl);
  const operations = publicOperations(document);

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="2PQ API"
        title="API documentation"
        description="Endpoint reference for external integrations using the public /open-api backend."
      />

      <section>
        <div className="flex items-center gap-2">
          <FileCode2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">General information</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Applies to the public API endpoints unless an operation states
          otherwise.
        </p>

        <dl className="mt-4 grid gap-x-8 gap-y-4 text-sm md:grid-cols-2">
          <div className="min-w-0">
            <dt className="font-medium text-foreground">
              Base URL
            </dt>
            <dd className="mt-1 min-w-0 text-muted-foreground">
              <code className="block overflow-x-auto whitespace-nowrap text-foreground">
                {baseUrl}
              </code>
            </dd>
          </div>

          <div className="min-w-0">
            <dt className="font-medium text-foreground">
              Authentication
            </dt>
            <dd className="mt-1 min-w-0 text-muted-foreground">
              <code className="block overflow-x-auto whitespace-nowrap text-foreground">
                Authorization: Bearer &lt;access_token&gt;
              </code>
              Obtain tokens with <code>POST /open-api/oauth/token</code>.
            </dd>
          </div>

          <div className="min-w-0">
            <dt className="font-medium text-foreground">
              Response format
            </dt>
            <dd className="mt-1 text-muted-foreground">
              <code className="text-foreground">application/json</code>
              <span className="block">
                Error responses also return JSON bodies.
              </span>
            </dd>
          </div>

          <div className="min-w-0">
            <dt className="font-medium text-foreground">
              Rate limit
            </dt>
            <dd className="mt-1 text-muted-foreground">
              <span className="block text-foreground">
                5 requests per minute per client.
              </span>
              Exceeded quota returns HTTP 429.
            </dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <FileCode2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Integrator endpoints</h2>
        </div>

        {operations.map(({ method, path, operation }) => {
          const requestExample = requestJsonExample(operation);
          const responseExample = firstJsonExample(operation);
          const codeSample = firstCodeSample(operation);
          const usesAccessToken = path !== "/open-api/oauth/token";

          return (
            <article
              key={`${method}-${path}`}
              className="min-w-0 rounded-lg border bg-card p-5 shadow-sm"
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

              <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">Request</h3>
                  {usesAccessToken ? (
                    <div className="mt-3 rounded-lg border bg-muted/35 p-3">
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Authorization header
                      </p>
                      <code className="mt-1 block overflow-x-auto text-xs text-foreground">
                        Authorization: Bearer &lt;access_token&gt;
                      </code>
                    </div>
                  ) : null}

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
                      {operation["x-parameterNote"] ? (
                        <p className="border-t bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
                          {operation["x-parameterNote"]}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {requestExample !== undefined ? (
                    <ApiCodeDisplay
                      title="Request body example"
                      code={stringifyExample(requestExample)}
                      className="mt-4"
                    />
                  ) : null}
                </div>

                <div className="min-w-0">
                  {responseExample !== undefined ? (
                    <>
                      <h3 className="text-sm font-semibold">Response</h3>
                      <ApiCodeDisplay
                        title="Example response"
                        code={stringifyExample(responseExample)}
                        className="mt-3"
                      />
                    </>
                  ) : null}
                </div>
              </div>

              {codeSample ? (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold">Sample curl</h3>
                  <ApiCodeDisplay
                    title="curl"
                    code={codeSample}
                    className="mt-3"
                  />
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
    </div>
  );
}
