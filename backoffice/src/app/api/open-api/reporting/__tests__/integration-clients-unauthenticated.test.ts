// Epic #451 — the admin reporting integration-client routes answer an
// unauthenticated caller with 500 (the SDK's /auth/context error bubbles into
// the generic catch). The existing suite pins that CURRENT behaviour in
// integration-clients.route.test.ts. The CORRECT answer is 401 without
// leaking the upstream SDK error text; this is marked `it.failing` until the
// route distinguishes "no session" from a real SDK failure. Do not "fix" the
// test — fix the route (src/app/api/open-api/reporting/integration-clients/route.ts
// GET catch → sdkErrorResponse) and flip it to `it`.

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
