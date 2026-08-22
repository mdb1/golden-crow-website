import { buildReportingOpenApiDocument } from "@/lib/reporting-openapi-contract";

describe("reporting OpenAPI contract", () => {
  it("lists the 2PQ case lookup endpoint first", () => {
    const document = buildReportingOpenApiDocument(
      "https://public.example.com",
    );
    const paths = Object.keys(document.paths ?? {});

    expect(paths[0]).toBe("/open-api/reporting/2pq/cases/{caseCode}");
  });
});
