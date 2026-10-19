import Fastify, { type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { ServiceNotificationTokenError } from "../lib/service-notification-access-token.js";
import { AdminRepositoryError } from "../repositories/admin-errors.js";

const exchangeNotificationCredentialsMock = jest.fn();

jest.mock("../repositories/reporting-tokens.repository.js", () => ({
  exchangeServiceNotificationClientCredentials: (...args: unknown[]) =>
    exchangeNotificationCredentialsMock(...args),
}));

describe("service notification access-token route", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { serviceNotificationAccessTokenRoutes } = await import(
      "../routes/service-notification-access-token.routes.js"
    );
    app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(serviceNotificationAccessTokenRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    exchangeNotificationCredentialsMock.mockReset();
    exchangeNotificationCredentialsMock.mockResolvedValue({
      access_token: "signed-notification-token",
      token_type: "Bearer",
      expires_in: 365 * 24 * 60 * 60,
      scope: "service-transactions:notify",
    });
  });

  it("exchanges trimmed existing API credentials for the long-lived notification token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/service-transactions/notification-token",
      payload: {
        grant_type: "client_credentials",
        client_id: "  gci_live_client  ",
        client_secret: "  gcs_live_secret  ",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers.pragma).toBe("no-cache");
    expect(response.json()).toEqual({
      access_token: "signed-notification-token",
      token_type: "Bearer",
      expires_in: 31_536_000,
      scope: "service-transactions:notify",
    });
    expect(exchangeNotificationCredentialsMock).toHaveBeenCalledWith({
      grant_type: "client_credentials",
      client_id: "gci_live_client",
      client_secret: "gcs_live_secret",
    });
  });

  it.each([
    undefined,
    {},
    { grant_type: "password", client_id: "client", client_secret: "secret" },
    { grant_type: "client_credentials", client_id: "", client_secret: "secret" },
    { grant_type: "client_credentials", client_id: "client", client_secret: "" },
    {
      grant_type: "client_credentials",
      client_id: "client",
      client_secret: "secret",
      scope: "reporting:write",
    },
    {
      grant_type: "client_credentials",
      client_id: `gci_live_${"a".repeat(256)}`,
      client_secret: "gcs_live_secret",
    },
    {
      grant_type: "client_credentials",
      client_id: "gci_live_parent/child",
      client_secret: "gcs_live_secret",
    },
    {
      grant_type: "client_credentials",
      client_id: "gci_live_client",
      client_secret: `gcs_live_${"a".repeat(512)}`,
    },
  ])("rejects malformed, incomplete, or extended credentials", async (payload) => {
    const response = await app.inject({
      method: "POST",
      url: "/service-transactions/notification-token",
      ...(payload === undefined ? {} : { payload }),
    });

    expect(response.statusCode).toBe(400);
    expect(exchangeNotificationCredentialsMock).not.toHaveBeenCalled();
  });

  it("returns the credential failure without leaking a token", async () => {
    exchangeNotificationCredentialsMock.mockRejectedValueOnce(
      new AdminRepositoryError("Invalid client credentials.", 401),
    );

    const response = await app.inject({
      method: "POST",
      url: "/service-transactions/notification-token",
      payload: {
        grant_type: "client_credentials",
        client_id: "gci_live_client",
        client_secret: "wrong-secret",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Invalid client credentials." });
    expect(response.body).not.toContain("signed-notification-token");
  });

  it("returns a generic 500 when the server signing key is unavailable", async () => {
    exchangeNotificationCredentialsMock.mockRejectedValueOnce(
      new ServiceNotificationTokenError("server secret detail", 500),
    );

    const response = await app.inject({
      method: "POST",
      url: "/service-transactions/notification-token",
      payload: {
        grant_type: "client_credentials",
        client_id: "gci_live_client",
        client_secret: "gcs_live_secret",
      },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: "Service notification authentication is unavailable.",
    });
    expect(response.body).not.toContain("server secret detail");
  });
});
