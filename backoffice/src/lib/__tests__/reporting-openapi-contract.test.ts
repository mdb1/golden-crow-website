import { buildReportingOpenApiDocument } from "@/lib/reporting-openapi-contract";

describe("reporting OpenAPI contract", () => {
  it("lists token exchange first and the 2PQ case lookup as the first business endpoint", () => {
    const document = buildReportingOpenApiDocument(
      "https://public.example.com",
    );
    const paths = Object.keys(document.paths ?? {});

    expect(paths[0]).toBe("/open-api/oauth/token");
    expect(paths[1]).toBe("/open-api/reporting/2pq/cases/{caseCode}");
  });

  it("documents client credentials token exchange with a 24-hour access token", () => {
    const document = buildReportingOpenApiDocument(
      "https://public.example.com",
    );
    const tokenOperation = document.paths?.["/open-api/oauth/token"]?.post;
    const requestExample =
      tokenOperation?.requestBody?.content?.["application/json"]?.example;
    const responseExample =
      tokenOperation?.responses?.["200"]?.content?.["application/json"]
        ?.example;

    expect(requestExample).toMatchObject({
      grant_type: "client_credentials",
      client_id: expect.stringMatching(/^gci_live_/),
      client_secret: expect.stringMatching(/^gcs_live_/),
    });
    expect(responseExample).toMatchObject({
      access_token: expect.stringMatching(/^eyJ/),
      token_type: "Bearer",
      expires_in: 86400,
      scope: "reporting:read reporting:write",
    });
  });

  it("documents patient lookup as an unwrapped patient response", () => {
    const document = buildReportingOpenApiDocument(
      "https://public.example.com",
    );
    const example =
      document.paths?.["/open-api/reporting/patients"]?.get?.responses?.["200"]
        ?.content?.["application/json"]?.example;

    expect(example).toMatchObject({
      id: expect.stringMatching(/^PAT-/),
      fullName: "Ada Lovelace",
    });
    expect(example).not.toHaveProperty("patient");
  });

  it("documents report upload notifications with caseCode and download_url", () => {
    const document = buildReportingOpenApiDocument(
      "https://public.example.com",
    );
    const operation =
      document.paths?.["/open-api/reporting/reports/upload"]?.post;
    const requestExample =
      operation?.requestBody?.content?.["application/json"]?.example;
    const curlSample = operation?.["x-codeSamples"]?.[0]?.source;

    expect(requestExample).toMatchObject({
      caseCode: "ABC001",
      download_url: "https://reports.example.com/ABC001.pdf",
    });
    expect(curlSample).toContain('"download_url"');
  });
});
