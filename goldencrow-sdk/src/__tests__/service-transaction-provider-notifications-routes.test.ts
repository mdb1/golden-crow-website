import Fastify, { type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";

const sendProviderNotificationMock = jest.fn();
const verifyServiceNotificationAccessTokenMock = jest.fn();
const AUTHORIZATION_HEADERS = {
  authorization: "Bearer signed-notification-token",
};

function serviceNotificationTokenError(statusCode: number): Error {
  return Object.assign(new Error("token verification failed"), {
    serviceNotificationTokenError: true,
    statusCode,
  });
}

jest.mock("../lib/service-transaction-provider-best-effort-email.js", () => ({
  sendServiceTransactionProviderBestEffortEmail: (...args: unknown[]) =>
    sendProviderNotificationMock(...args),
}));

jest.mock("../lib/service-notification-access-token.js", () => ({
  verifyServiceNotificationAccessToken: (...args: unknown[]) =>
    verifyServiceNotificationAccessTokenMock(...args),
  isServiceNotificationTokenError: (error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    "serviceNotificationTokenError" in error,
}));

describe("service transaction provider notification routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { serviceTransactionProviderNotificationRoutes } = await import(
      "../routes/service-transaction-provider-notifications.routes.js"
    );
    app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(serviceTransactionProviderNotificationRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    sendProviderNotificationMock.mockReset();
    sendProviderNotificationMock.mockResolvedValue(undefined);
    verifyServiceNotificationAccessTokenMock.mockReset();
    verifyServiceNotificationAccessTokenMock.mockReturnValue({
      client_id: "client-1",
      scope: "service-transactions:notify",
    });
  });

  it.each([
    ["a missing Authorization header", undefined],
    ["Basic credentials", "Basic dXNlcjpwYXNz"],
    ["an empty Bearer credential", "Bearer    "],
    ["a Bearer credential containing whitespace", "Bearer two tokens"],
  ])("returns 401 before validation or email delivery for %s", async (_label, authorization) => {
    const response = await app.inject({
      method: "POST",
      url: "/service-transactions/notify-provider",
      headers: authorization ? { authorization } : {},
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: "Missing service notification access token.",
    });
    expect(verifyServiceNotificationAccessTokenMock).not.toHaveBeenCalled();
    expect(sendProviderNotificationMock).not.toHaveBeenCalled();
  });

  it("returns 401 for an invalid or expired signed token", async () => {
    verifyServiceNotificationAccessTokenMock.mockImplementationOnce(() => {
      throw serviceNotificationTokenError(401);
    });

    const response = await app.inject({
      method: "POST",
      url: "/service-transactions/notify-provider",
      headers: AUTHORIZATION_HEADERS,
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: "Invalid service notification access token.",
    });
    expect(sendProviderNotificationMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the signed token lacks the notification scope", async () => {
    verifyServiceNotificationAccessTokenMock.mockImplementationOnce(() => {
      throw serviceNotificationTokenError(403);
    });

    const response = await app.inject({
      method: "POST",
      url: "/service-transactions/notify-provider",
      headers: AUTHORIZATION_HEADERS,
      payload: {},
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "Service notification access token scope is insufficient.",
    });
    expect(sendProviderNotificationMock).not.toHaveBeenCalled();
  });

  it("returns a generic 500 when token verification is unavailable", async () => {
    verifyServiceNotificationAccessTokenMock.mockImplementationOnce(() => {
      throw serviceNotificationTokenError(500);
    });

    const response = await app.inject({
      method: "POST",
      url: "/service-transactions/notify-provider",
      headers: AUTHORIZATION_HEADERS,
      payload: {},
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: "Service notification authentication is unavailable.",
    });
    expect(sendProviderNotificationMock).not.toHaveBeenCalled();
  });

  it("normalizes the trusted client payload and sends one provider email", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/service-transactions/notify-provider",
      headers: AUTHORIZATION_HEADERS,
      payload: {
        providerContactEmail: "  Provider@Example.ORG ",
        requestedByUserEmail: "  Requester@Example.COM ",
        serviceName: "  Secuenciacion de exoma  ",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "sent" });
    expect(sendProviderNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendProviderNotificationMock).toHaveBeenCalledWith({
      providerContactEmail: "provider@example.org",
      requestedByUserEmail: "requester@example.com",
      serviceName: "Secuenciacion de exoma",
    });
  });

  it("does not impose the reporting API five-request quota on email calls", async () => {
    const responses = [];
    for (let index = 0; index < 6; index += 1) {
      responses.push(
        await app.inject({
          method: "POST",
          url: "/service-transactions/notify-provider",
          headers: AUTHORIZATION_HEADERS,
          payload: {
            providerContactEmail: `provider-${index}@example.org`,
            requestedByUserEmail: "requester@example.com",
            serviceName: `Service ${index}`,
          },
        }),
      );
    }

    expect(responses.map((response) => response.statusCode)).toEqual([
      200, 200, 200, 200, 200, 200,
    ]);
    expect(verifyServiceNotificationAccessTokenMock).toHaveBeenCalledTimes(6);
    expect(sendProviderNotificationMock).toHaveBeenCalledTimes(6);
  });

  it.each([
    {
      providerContactEmail: "not-an-email",
      requestedByUserEmail: "requester@example.com",
      serviceName: "Service",
    },
    {
      providerContactEmail: "provider@example.org",
      requestedByUserEmail: "not-an-email",
      serviceName: "Service",
    },
    {
      providerContactEmail: "provider@example.org",
      requestedByUserEmail: "requester@example.com",
      serviceName: " ",
    },
    {
      providerContactEmail: `${"a".repeat(309)}@example.org`,
      requestedByUserEmail: "requester@example.com",
      serviceName: "Service",
    },
    {
      providerContactEmail: "provider@example.org",
      requestedByUserEmail: `${"a".repeat(309)}@example.org`,
      serviceName: "Service",
    },
    {
      providerContactEmail: "provider@example.org",
      requestedByUserEmail: "requester@example.com",
      serviceName: "s".repeat(181),
    },
  ])("rejects an invalid or out-of-bounds provider payload", async (payload) => {
    const response = await app.inject({
      method: "POST",
      url: "/service-transactions/notify-provider",
      headers: AUTHORIZATION_HEADERS,
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(sendProviderNotificationMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      providerContactEmail: "provider@example.org",
      requestedByUserEmail: "requester@example.com",
      serviceName: "Service",
      html: "<strong>Untrusted HTML</strong>",
    },
    {
      providerContactEmail: "provider@example.org",
      requestedByUserEmail: "requester@example.com",
      serviceName: "Service",
      hubUrl: "https://attacker.example.org",
    },
    {
      providerContactEmail: "provider@example.org",
      requestedByUserEmail: "requester@example.com",
      serviceName: "Service",
      transactionId: "pgr_ios_not-part-of-this-contract",
    },
  ])("rejects client-controlled message fields", async (payload) => {
    const response = await app.inject({
      method: "POST",
      url: "/service-transactions/notify-provider",
      headers: AUTHORIZATION_HEADERS,
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(sendProviderNotificationMock).not.toHaveBeenCalled();
  });

  it("returns a generic gateway error when Gmail delivery fails", async () => {
    sendProviderNotificationMock.mockRejectedValueOnce(
      new Error("secret upstream detail"),
    );

    const response = await app.inject({
      method: "POST",
      url: "/service-transactions/notify-provider",
      headers: AUTHORIZATION_HEADERS,
      payload: {
        providerContactEmail: "provider@example.org",
        requestedByUserEmail: "requester@example.com",
        serviceName: "Service",
      },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: "Provider notification email could not be sent.",
    });
    expect(response.body).not.toContain("secret upstream detail");
  });
});
