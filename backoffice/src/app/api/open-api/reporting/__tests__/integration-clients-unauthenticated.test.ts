// Epic #451 — the admin reporting integration-client routes used to answer an
// unauthenticated caller with 500 (the SDK's /auth/context error bubbled into
// the generic catch). Pinned as `it.failing` in #452; fixed since: the route
// resolves the session with getAdminContextOrNull() and answers 401 before any
// SDK call, without leaking the upstream error text. Keep this as a regression.

jest.mock("@/lib/sdk-server", () => ({
  sdkFetchServer: jest.fn(async (path: string) => {
    if (path === "/auth/context") {
      throw new Error("SDK GET /auth/context failed: No authenticated admin context");
    }
    throw new Error(`unexpected SDK call ${path}`);
  }),
}));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));

import { GET } from "@/app/api/open-api/reporting/integration-clients/route";

describe("GET /api/open-api/reporting/integration-clients — unauthenticated", () => {
  it("is 401, not 500", async () => {
    const res = await GET(
      new Request("https://backoffice.test/api/open-api/reporting/integration-clients"),
    );
    expect(res.status).toBe(401);
  });
});
