import Fastify, { type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";

const sendProviderNotificationMock = jest.fn();

jest.mock("../lib/service-transaction-provider-best-effort-email.js", () => ({
  sendServiceTransactionProviderBestEffortEmail: (...args: unknown[]) =>
    sendProviderNotificationMock(...args),
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
  });

  it("normalizes the trusted client payload and sends one provider email", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/service-transactions/notify-provider",
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
