import { SdkRequestError, sdkFetch } from "@/lib/sdk-client";

describe("sdkFetch error handling", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("uses a Fastify validation message while preserving the complete error details", async () => {
    const responseBody = {
      statusCode: 400,
      code: "FST_ERR_VALIDATION",
      error: "Bad Request",
      message: "body/customerId must match pattern \\\"^[A-Z0-9]+$\\\"",
    };
    global.fetch = jest.fn().mockResolvedValue(
      Response.json(responseBody, {
        status: 400,
        statusText: "Bad Request",
        headers: {
          "x-vercel-id": "iad1::sdk-request-id",
        },
      }),
    ) as unknown as typeof fetch;

    const error = await sdkFetch("/crm/customers/customer-1", {
      method: "PATCH",
      body: JSON.stringify({ customerId: "invalid id" }),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SdkRequestError);
    expect(error).toMatchObject({
      status: 400,
      method: "PATCH",
      path: "/crm/customers/customer-1",
      message: responseBody.message,
    });

    const details = (error as SdkRequestError).details;
    expect(details).toContain("Request: PATCH /crm/customers/customer-1");
    expect(details).toContain('"customerId": "invalid id"');
    expect(details).toContain("Status: 400 Bad Request");
    expect(details).toContain("Vercel request id: iad1::sdk-request-id");
    expect(details).toContain('"error": "Bad Request"');
    expect(details).toContain(
      `"message": ${JSON.stringify(responseBody.message)}`,
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

    const error = await sdkFetch("/crm/customers/customer-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SdkRequestError);
    expect(error).toMatchObject({
      message: "Customer update failed.",
    });
  });

  it("shows the precise server message when a privileged diagnostic is present", async () => {
    const responseBody = {
      error: "Internal Server Error",
      message:
        "Discover operation failed during preparing reciprocal writes: Invalid Firestore value.",
      stage: "preparing reciprocal writes",
      diagnostic: {
        name: "DiscoverRepositoryOperationError",
        message:
          "Discover operation failed during preparing reciprocal writes: Invalid Firestore value.",
      },
    };
    global.fetch = jest.fn().mockResolvedValue(
      Response.json(responseBody, {
        status: 500,
        statusText: "Internal Server Error",
      }),
    ) as unknown as typeof fetch;

    const error = await sdkFetch("/discover/organizations/org-1", {
      method: "PUT",
      body: JSON.stringify({ linkedIndividualProfessionalIds: ["person-1"] }),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SdkRequestError);
    expect(error).toMatchObject({ message: responseBody.message });
    expect((error as SdkRequestError).details).toContain(
      '"stage": "preparing reciprocal writes"',
    );
  });

  it("omits uploaded image data from request diagnostics", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      Response.json(
        { error: "Internal Server Error", errorName: "Error" },
        { status: 500, statusText: "Internal Server Error" },
      ),
    ) as unknown as typeof fetch;
    const imageUploadDataUrl = `data:image/png;base64,${"A".repeat(20_000)}`;

    const error = await sdkFetch("/discover/individuals/person-1", {
      method: "PUT",
      body: JSON.stringify({ imageUploadDataUrl }),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SdkRequestError);
    const details = (error as SdkRequestError).details;
    expect(details).toContain("<image data omitted:");
    expect(details).not.toContain(imageUploadDataUrl);
  });
});
