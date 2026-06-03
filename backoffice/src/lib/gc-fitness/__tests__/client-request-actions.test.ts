import { CLIENT_REQUEST_TTL_MS, getClientRequestStatus } from "../client-request-actions";

describe("client-request-actions", () => {
  const now = new Date("2026-06-03T15:00:00.000Z");

  it("returns inactive when there was no request", () => {
    const status = getClientRequestStatus(null, now);

    expect(status.requestedAt).toBeNull();
    expect(status.expiresAt).toBeNull();
    expect(status.isActive).toBe(false);
  });

  it("keeps the request active for three days", () => {
    const requestedAt = new Date("2026-06-02T15:00:00.000Z");
    const status = getClientRequestStatus(requestedAt, now);

    expect(status.requestedAt?.toISOString()).toBe(requestedAt.toISOString());
    expect(status.expiresAt?.toISOString()).toBe(
      new Date(requestedAt.getTime() + CLIENT_REQUEST_TTL_MS).toISOString(),
    );
    expect(status.isActive).toBe(true);
  });

  it("turns inactive after the TTL passes", () => {
    const requestedAt = new Date("2026-05-30T15:00:00.000Z");
    const status = getClientRequestStatus(requestedAt, now);

    expect(status.requestedAt?.toISOString()).toBe(requestedAt.toISOString());
    expect(status.isActive).toBe(false);
  });
});
