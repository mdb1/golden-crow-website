const mockCookies = jest.fn();
const mockHeaders = jest.fn();

jest.mock("next/headers", () => ({
  cookies: (...args: unknown[]) => mockCookies(...args),
  headers: (...args: unknown[]) => mockHeaders(...args),
}));

import { sdkFetchServer } from "@/lib/sdk-server";

describe("sdkFetchServer error handling", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GOLDENCROW_SDK_URL: "https://sdk.example.com",
    };
    mockCookies.mockResolvedValue({
      get: jest.fn(() => ({ value: "session-token" })),
    });
    mockHeaders.mockResolvedValue(new Headers({ host: "backoffice.example.com" }));
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it("uses the server message instead of Fastify's generic error label", async () => {
    const responseBody = {
      statusCode: 400,
      code: "FST_ERR_VALIDATION",
      error: "Bad Request",
      message: "A customer with this email already exists.",
    };
    global.fetch = jest.fn().mockResolvedValue(
      Response.json(responseBody, {
        status: 400,
        statusText: "Bad Request",
      }),
    ) as unknown as typeof fetch;

    const error = await sdkFetchServer("/crm/customers", {
      method: "POST",
      body: JSON.stringify({ email: "existing@example.com" }),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(
      "SDK POST /crm/customers failed: A customer with this email already exists.",
    );
    expect((error as Error).message).toContain('"error": "Bad Request"');
    expect((error as Error).message).toContain(
      '"message": "A customer with this email already exists."',
    );
  });

  it("keeps a sanitized public error ahead of diagnostic messages", async () => {
    const responseBody = {
      statusCode: 500,
      error: "Customer update failed.",
      message: "Internal Firestore index details that are not public.",
    };
    global.fetch = jest.fn().mockResolvedValue(
      Response.json(responseBody, {
        status: 500,
        statusText: "Internal Server Error",
      }),
    ) as unknown as typeof fetch;

    const error = await sdkFetchServer("/crm/customers/customer-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(
      "SDK PATCH /crm/customers/customer-1 failed: Customer update failed.",
    );
  });
});
