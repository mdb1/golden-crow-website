import Fastify, { type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { issueServiceNotificationAccessToken } from "../lib/service-notification-access-token.js";

const sendProviderNotificationMock = jest.fn();
const sendRequesterConfirmationMock = jest.fn();

jest.mock("../lib/service-transaction-provider-best-effort-email.js", () => ({
  sendServiceTransactionProviderBestEffortEmail: (...args: unknown[]) =>
    sendProviderNotificationMock(...args),
}));

jest.mock(
  "../lib/service-transaction-requester-confirmation-email.js",
  () => ({
    sendServiceTransactionRequesterConfirmationEmail: (...args: unknown[]) =>
      sendRequesterConfirmationMock(...args),
  }),
);

describe("service notification email authentication integration", () => {
  const originalEnv = process.env;
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      SERVICE_TRANSACTION_NOTIFICATION_TOKEN_SIGNING_SECRET:
        "integration-notification-signing-secret-".repeat(2),
    };
    const { serviceTransactionProviderNotificationRoutes } = await import(
      "../routes/service-transaction-provider-notifications.routes.js"
    );
    const { serviceTransactionRequesterConfirmationRoutes } = await import(
      "../routes/service-transaction-requester-confirmations.routes.js"
    );

    app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(serviceTransactionProviderNotificationRoutes);
    await app.register(serviceTransactionRequesterConfirmationRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    process.env = originalEnv;
  });

  beforeEach(() => {
    sendProviderNotificationMock.mockReset();
    sendProviderNotificationMock.mockResolvedValue(undefined);
    sendRequesterConfirmationMock.mockReset();
    sendRequesterConfirmationMock.mockResolvedValue(undefined);
  });

  it("accepts five provider emails plus one requester email with the same real token", async () => {
    const token = issueServiceNotificationAccessToken({
      clientId: `gci_live_${"a".repeat(43)}`,
    }).access_token;
    const headers = { authorization: `Bearer ${token}` };
    const responses = [];

    for (let index = 0; index < 5; index += 1) {
      responses.push(
        await app.inject({
          method: "POST",
          url: "/service-transactions/notify-provider",
          headers,
          payload: {
            providerContactEmail: `provider-${index}@example.org`,
            requestedByUserEmail: "requester@example.org",
            serviceName: `Service ${index}`,
          },
        }),
      );
    }

    responses.push(
      await app.inject({
        method: "POST",
        url: "/service-transactions/notify-requester",
        headers,
        payload: {
          requestedByUserEmail: "requester@example.org",
          items: [
            { serviceName: "Service 0", providerName: "Provider 0" },
          ],
        },
      }),
    );

    expect(responses.map((response) => response.statusCode)).toEqual([
      200, 200, 200, 200, 200, 200,
    ]);
    expect(sendProviderNotificationMock).toHaveBeenCalledTimes(5);
    expect(sendRequesterConfirmationMock).toHaveBeenCalledTimes(1);
  });
});
