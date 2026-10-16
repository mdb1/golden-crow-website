// Route-level tests for the thin public reporting Open API wrappers
// (epic #451). The handler logic is covered in
// src/lib/open-api/__tests__/reporting-handlers.test.ts; these assert the
// App Router exports are wired to it: method, params, and the 401/400 gates
// that must fire BEFORE anything reaches the SDK.

import { POST as tokenPOST } from "@/app/open-api/oauth/token/route";
import * as patientsRoute from "@/app/open-api/reporting/patients/route";
import * as caseRoute from "@/app/open-api/reporting/2pq/cases/[caseCode]/route";
import * as uploadRoute from "@/app/open-api/reporting/reports/upload/route";

const ORIGIN = "https://backoffice.example.com/open-api";
const BEARER = { authorization: "Bearer reporting-token" };

const originalFetch = global.fetch;
const originalEnv = process.env;
let fetchMock: jest.Mock;

beforeEach(() => {
  process.env = { ...originalEnv, GOLDENCROW_SDK_URL: "https://sdk.example.com" };
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  process.env = originalEnv;
  global.fetch = originalFetch;
});

function sdkReplies(payload: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(Response.json(payload, { status }));
}

function caseParams(caseCode: string) {
  return { params: Promise.resolve({ caseCode }) };
}

describe("route config", () => {
  it("reporting routes are force-dynamic (never statically cached)", () => {
    expect(patientsRoute.dynamic).toBe("force-dynamic");
    expect(caseRoute.dynamic).toBe("force-dynamic");
    expect(uploadRoute.dynamic).toBe("force-dynamic");
  });
});

describe("POST /open-api/oauth/token", () => {
  it("bad JSON → 400 without calling the SDK", async () => {
    const res = await tokenPOST(
      new Request(`${ORIGIN}/oauth/token`, { method: "POST", body: "{nope" }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid JSON body." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [{}],
    [{ grant_type: "password", client_id: "c", client_secret: "s" }],
    [{ grant_type: "client_credentials", client_id: "c" }],
    [{ grant_type: "client_credentials", client_id: "c", client_secret: "s", scope: "admin" }],
  ])("invalid body %j → 400", async (body) => {
    const res = await tokenPOST(
      new Request(`${ORIGIN}/oauth/token`, { method: "POST", body: JSON.stringify(body) }),
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("valid body → forwards to the SDK without a bearer and returns its token", async () => {
    sdkReplies({ access_token: "jwt", token_type: "Bearer", expires_in: 3600 });
    const res = await tokenPOST(
      new Request(`${ORIGIN}/oauth/token`, {
        method: "POST",
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: "c",
          client_secret: "s",
        }),
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      access_token: "jwt",
      token_type: "Bearer",
      expires_in: 3600,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://sdk.example.com/internal/openapi/oauth/token");
    expect(init.method).toBe("POST");
    expect((init.headers as Headers).get("authorization")).toBeNull();
  });

  it("SDK 401 (bad client secret) is passed through", async () => {
    sdkReplies({ error: "invalid_client" }, 401);
    const res = await tokenPOST(
      new Request(`${ORIGIN}/oauth/token`, {
        method: "POST",
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: "c",
          client_secret: "wrong",
        }),
      }),
    );
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "invalid_client" });
  });
});

describe("GET /open-api/reporting/patients", () => {
  it("unauthenticated → 401", async () => {
    const res = await patientsRoute.GET(
      new Request(`${ORIGIN}/reporting/patients?patientId=PAT-1`),
    );
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("non-Bearer authorization → 401", async () => {
    const res = await patientsRoute.GET(
      new Request(`${ORIGIN}/reporting/patients?patientId=PAT-1`, {
        headers: { authorization: "Basic abc" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it.each(["", "?email=a@b.com", "?patientId=P&caseCode=ABC123", "?caseCode=AB"])(
    "invalid query %j → 400",
    async (query) => {
      const res = await patientsRoute.GET(
        new Request(`${ORIGIN}/reporting/patients${query}`, { headers: BEARER }),
      );
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("authorized → unwraps the patient record", async () => {
    sdkReplies({ patient: { id: "PAT-1" } });
    const res = await patientsRoute.GET(
      new Request(`${ORIGIN}/reporting/patients?caseCode=abc123`, { headers: BEARER }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: "PAT-1" });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://sdk.example.com/internal/openapi/reporting/patients?caseCode=ABC123",
    );
  });
});

describe("GET /open-api/reporting/2pq/cases/[caseCode]", () => {
  it("unauthenticated → 401", async () => {
    const res = await caseRoute.GET(
      new Request(`${ORIGIN}/reporting/2pq/cases/ABC123`),
      caseParams("ABC123"),
    );
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["ABC", "ABC1234", "../../x", "ABC-12"])("bad caseCode %j → 400", async (code) => {
    const res = await caseRoute.GET(
      new Request(`${ORIGIN}/reporting/2pq/cases/x`, { headers: BEARER }),
      caseParams(code),
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("awaits params and forwards the upper-cased code", async () => {
    sdkReplies({ caseSnapshot: { code: "ABC123" } });
    const res = await caseRoute.GET(
      new Request(`${ORIGIN}/reporting/2pq/cases/abc123`, { headers: BEARER }),
      caseParams("abc123"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ code: "ABC123" });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://sdk.example.com/internal/openapi/reporting/2pq/cases/ABC123",
    );
  });
});

describe("POST /open-api/reporting/reports/upload", () => {
  const url = `${ORIGIN}/reporting/reports/upload`;

  it("unauthenticated → 401 (even with a bad body)", async () => {
    const res = await uploadRoute.POST(new Request(url, { method: "POST", body: "{nope" }));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bad JSON → 400", async () => {
    const res = await uploadRoute.POST(
      new Request(url, { method: "POST", headers: BEARER, body: "{nope" }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid JSON body." });
  });

  it.each([
    [{ caseCode: "ABC123" }],
    [{ caseCode: "ABC123", download_url: "not a url" }],
    [{ caseCode: "ABC123", download_url: "https://x.com/r.pdf", extra: 1 }],
  ])("invalid body %j → 400", async (body) => {
    const res = await uploadRoute.POST(
      new Request(url, { method: "POST", headers: BEARER, body: JSON.stringify(body) }),
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("valid → 201 with the normalised caseCode", async () => {
    sdkReplies({ status: "accepted" });
    const res = await uploadRoute.POST(
      new Request(url, {
        method: "POST",
        headers: BEARER,
        body: JSON.stringify({ caseCode: "abc123", download_url: "https://x.com/r.pdf" }),
      }),
    );
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ status: "accepted", caseCode: "ABC123" });
  });
});
