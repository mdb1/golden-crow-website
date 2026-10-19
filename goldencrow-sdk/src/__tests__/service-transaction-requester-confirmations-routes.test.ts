import Fastify, { type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { SERVICE_TRANSACTION_REQUESTER_CONFIRMATION_MAX_ITEMS } from "../lib/service-transaction-requester-confirmation-contract.js";

const sendRequesterConfirmationMock = jest.fn();

jest.mock(
  "../lib/service-transaction-requester-confirmation-email.js",
  () => ({
    sendServiceTransactionRequesterConfirmationEmail: (...args: unknown[]) =>
      sendRequesterConfirmationMock(...args),
  }),
);

describe("service transaction requester confirmation routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { serviceTransactionRequesterConfirmationRoutes } = await import(
      "../routes/service-transaction-requester-confirmations.routes.js"
    );
    app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(serviceTransactionRequesterConfirmationRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    sendRequesterConfirmationMock.mockReset();
    sendRequesterConfirmationMock.mockResolvedValue(undefined);
  });

  it("normalizes the email and names before sending one aggregate email", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/service-transactions/notify-requester",
      payload: {
        requestedByUserEmail: "  Requester@Example.ORG ",
        items: [
          {
            serviceName: "  Secuenciacion de exoma  ",
            providerName: "  Laboratorio Uno  ",
          },
          {
            serviceName: "Consulta genetica",
            providerName: "Profesional Dos",
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "sent", itemCount: 2 });
    expect(sendRequesterConfirmationMock).toHaveBeenCalledTimes(1);
    expect(sendRequesterConfirmationMock).toHaveBeenCalledWith({
      requesterEmail: "requester@example.org",
      items: [
        {
          serviceName: "Secuenciacion de exoma",
          providerName: "Laboratorio Uno",
        },
        {
          serviceName: "Consulta genetica",
          providerName: "Profesional Dos",
        },
      ],
    });
  });

  it.each([
    {
      requestedByUserEmail: "not-an-email",
      items: [{ serviceName: "Service", providerName: "Provider" }],
    },
    { requestedByUserEmail: "person@example.org", items: [] },
    {
      requestedByUserEmail: "person@example.org",
      items: [{ serviceName: " ", providerName: "Provider" }],
    },
    {
      requestedByUserEmail: "person@example.org",
      items: [{ serviceName: "Service", providerName: " " }],
    },
  ])("rejects an invalid requester payload", async (payload) => {
    const response = await app.inject({
      method: "POST",
      url: "/service-transactions/notify-requester",
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(sendRequesterConfirmationMock).not.toHaveBeenCalled();
  });

  it("rejects more than the bounded number of email rows", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/service-transactions/notify-requester",
      payload: {
        requestedByUserEmail: "person@example.org",
        items: Array.from(
          {
            length:
              SERVICE_TRANSACTION_REQUESTER_CONFIRMATION_MAX_ITEMS + 1,
          },
          (_, index) => ({
            serviceName: `Service ${index}`,
            providerName: `Provider ${index}`,
          }),
        ),
      },
    });

    expect(response.statusCode).toBe(400);
    expect(sendRequesterConfirmationMock).not.toHaveBeenCalled();
  });

  it("rejects requester and row values beyond their contract bounds", async () => {
    for (const payload of [
      {
        requestedByUserEmail: `${"a".repeat(309)}@example.org`,
        items: [{ serviceName: "Service", providerName: "Provider" }],
      },
      {
        requestedByUserEmail: "person@example.org",
        items: [
          { serviceName: "s".repeat(181), providerName: "Provider" },
        ],
      },
      {
        requestedByUserEmail: "person@example.org",
        items: [
          { serviceName: "Service", providerName: "p".repeat(181) },
        ],
      },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/service-transactions/notify-requester",
        payload,
      });

      expect(response.statusCode).toBe(400);
    }

    expect(sendRequesterConfirmationMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      requestedByUserEmail: "person@example.org",
      items: [{ serviceName: "Service", providerName: "Provider" }],
      html: "<strong>Untrusted HTML</strong>",
    },
    {
      requestedByUserEmail: "person@example.org",
      items: [
        {
          serviceName: "Service",
          providerName: "Provider",
          recipient: "attacker@example.org",
        },
      ],
    },
  ])("rejects client-controlled message fields", async (payload) => {
    const response = await app.inject({
      method: "POST",
      url: "/service-transactions/notify-requester",
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(sendRequesterConfirmationMock).not.toHaveBeenCalled();
  });

  it("returns a generic gateway error when Gmail delivery fails", async () => {
    sendRequesterConfirmationMock.mockRejectedValueOnce(
      new Error("secret upstream detail"),
    );

    const response = await app.inject({
      method: "POST",
      url: "/service-transactions/notify-requester",
      payload: {
        requestedByUserEmail: "person@example.org",
        items: [{ serviceName: "Service", providerName: "Provider" }],
      },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: "Requester confirmation email could not be sent.",
    });
    expect(response.body).not.toContain("secret upstream detail");
  });
});
