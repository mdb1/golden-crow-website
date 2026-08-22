import { buildReportingOpenApiDocument } from "@/lib/reporting-openapi-contract";

describe("reporting OpenAPI contract", () => {
  it("lists the 2PQ case lookup endpoint first", () => {
    const document = buildReportingOpenApiDocument(
      "https://public.example.com",
    );
    const paths = Object.keys(document.paths ?? {});

    expect(paths[0]).toBe("/open-api/reporting/2pq/cases/{caseCode}");
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
});
