import Fastify, { type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { AdminRepositoryError } from "../repositories/admin-errors.js";

const notifyOwnerMock = jest.fn();
const transactionId = "pgr_ios_0123456789abcdef0123456789abcdef";

jest.mock("../repositories/support-services.repository.js", () => ({
  notifySupportServiceTransactionOwner: (...args: unknown[]) =>
    notifyOwnerMock(...args),
}));

describe("service transaction notification routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { serviceTransactionNotificationRoutes } = await import(
      "../routes/service-transaction-notifications.routes.js"
    );
    app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(serviceTransactionNotificationRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    notifyOwnerMock.mockReset();
    notifyOwnerMock.mockResolvedValue({
      transactionId,
      status: "sent",
    });
  });

  it("normalizes the requester email and returns a sent result", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/service-transactions/${transactionId}/notify-owner`,
      payload: { requestedByUserEmail: "  Requester@Example.ORG " },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      transactionId,
      status: "sent",
    });
    expect(notifyOwnerMock).toHaveBeenCalledWith(
      transactionId,
      "requester@example.org",
    );
  });

  it("returns accepted while another caller owns the delivery lease", async () => {
    notifyOwnerMock.mockResolvedValueOnce({
      transactionId,
      status: "in_progress",
    });

    const response = await app.inject({
      method: "POST",
      url: `/service-transactions/${transactionId}/notify-owner`,
      payload: { requestedByUserEmail: "requester@example.org" },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().status).toBe("in_progress");
  });

  it("returns a retryable mail failure from the repository", async () => {
    notifyOwnerMock.mockRejectedValueOnce(
      new AdminRepositoryError(
        "The service transaction was saved, but its owner email could not be sent. Retry the notification request.",
        502,
      ),
    );

    const response = await app.inject({
      method: "POST",
      url: `/service-transactions/${transactionId}/notify-owner`,
      payload: { requestedByUserEmail: "requester@example.org" },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json().error).toContain("Retry the notification request");
  });

  it("rejects arbitrary recipient or message fields", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/service-transactions/${transactionId}/notify-owner`,
      payload: {
        requestedByUserEmail: "requester@example.org",
        recipient: "attacker@example.org",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(notifyOwnerMock).not.toHaveBeenCalled();
  });

  it("rejects deterministic and non-native transaction IDs", async () => {
    for (const rejectedId of ["pgr_2pq_case_00022", "pgr_new_report_1"]) {
      const response = await app.inject({
        method: "POST",
        url: `/service-transactions/${rejectedId}/notify-owner`,
        payload: { requestedByUserEmail: "requester@example.org" },
      });

      expect(response.statusCode).toBe(400);
    }
    expect(notifyOwnerMock).not.toHaveBeenCalled();
  });
});
