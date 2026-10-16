// Route-level tests for client bookings: the PUBLIC booking form endpoint
// (validation, webhook fan-out, nothing secret in the response) and the
// GOD-MODE-only admin inbox (/admin/client-bookings*).
import type { FastifyInstance } from "fastify";
import { ENV } from "../config/env.js";
import { AdminRepositoryError } from "../repositories/admin-errors.js";
import type { AdminContext } from "../types/sdk.types.js";
import { buildRouteServer, makeAdminContext } from "./support/route-harness.js";

const mockAcknowledgeClientBooking = jest.fn();
const mockArchiveClientBooking = jest.fn();
const mockCreateClientBooking = jest.fn();
const mockListClientBookingsForCalendarMonth = jest.fn();
const mockListClientBookingsPage = jest.fn();
const mockRecordClientBookingWebhookNotification = jest.fn();

jest.mock("../repositories/client-bookings.repository.js", () => ({
  acknowledgeClientBooking: mockAcknowledgeClientBooking,
  archiveClientBooking: mockArchiveClientBooking,
  createClientBooking: mockCreateClientBooking,
  listClientBookingsForCalendarMonth: mockListClientBookingsForCalendarMonth,
  listClientBookingsPage: mockListClientBookingsPage,
  recordClientBookingWebhookNotification:
    mockRecordClientBookingWebhookNotification,
}));

jest.mock("../config/env.js", () => ({
  ENV: { CLIENT_BOOKING_WEBHOOK_URL: undefined },
}));

const WEBHOOK_SECRET = "whsec-DO-NOT-LEAK-123";
const WEBHOOK_URL = `https://hooks.example.com/catch/987/abc?token=${WEBHOOK_SECRET}`;

const GOD_MODE = makeAdminContext({
  email: "god@example.com",
  isBootstrap: true,
});

function validBooking() {
  return {
    source: {
      context: "landing-hero",
      locale: "es",
      pageUrl: "https://goldencrowvs.com/contact",
      path: "/contact",
      referrer: "",
    },
    event: {
      title: "Discovery call",
      durationMinutes: 30,
      timezone: "America/Argentina/Buenos_Aires",
      timezoneLabel: "Buenos Aires (GMT-3)",
      date: "2026-10-20",
      startTime: "10:00",
      endTime: "10:30",
      startsAt: "2026-10-20T13:00:00.000Z",
      endsAt: "2026-10-20T13:30:00.000Z",
    },
    form: {
      fullName: "Ada Lovelace",
      email: "  Ada@Example.COM ",
      whatsapp: "+54 11 5555 5555",
      companyName: "Analytical Engines",
    },
  };
}

let currentContext: AdminContext | undefined;
let fastify: FastifyInstance;
let fetchSpy: jest.SpyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  ENV.CLIENT_BOOKING_WEBHOOK_URL = undefined;
  currentContext = undefined;
  fetchSpy = jest.spyOn(globalThis, "fetch");
  mockCreateClientBooking.mockResolvedValue({ id: "booking-1" });
  mockRecordClientBookingWebhookNotification.mockResolvedValue(undefined);
  const { clientBookingsRoutes } = await import(
    "../routes/client-bookings.routes.js"
  );
  fastify = await buildRouteServer(clientBookingsRoutes, () => currentContext);
});

afterEach(async () => {
  fetchSpy.mockRestore();
  await fastify.close();
});

describe("POST /client-bookings (public)", () => {
  function withChange(mutate: (booking: ReturnType<typeof validBooking>) => void) {
    const booking = validBooking();
    mutate(booking);
    return booking;
  }

  it.each([
    ["an invalid email", withChange((b) => void (b.form.email = "not-an-email"))],
    ["a duration under 15 minutes", withChange((b) => void (b.event.durationMinutes = 10))],
    ["a duration over 120 minutes", withChange((b) => void (b.event.durationMinutes = 121))],
    ["a malformed date", withChange((b) => void (b.event.date = "20-10-2026"))],
    ["a non-ISO startsAt", withChange((b) => void (b.event.startsAt = "tomorrow"))],
    ["an over-long company name", withChange((b) => void (b.form.companyName = "x".repeat(161)))],
    ["a short whatsapp", withChange((b) => void (b.form.whatsapp = "123"))],
  ])("rejects %s with 400, storing nothing and calling no webhook", async (_, payload) => {
    ENV.CLIENT_BOOKING_WEBHOOK_URL = WEBHOOK_URL;

    const response = await fastify.inject({
      method: "POST",
      url: "/client-bookings",
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(mockCreateClientBooking).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // BUG (validation, defense in depth): OptionalUrlSchema is `z.string().url()`,
  // which accepts ANY scheme, so the unauthenticated booking form stores
  // `source.pageUrl = "javascript:..."` (client-bookings.routes.ts:15-21). The
  // GOD MODE inbox renders that value as `<a href={booking.source.pageUrl}>`
  // (backoffice client-bookings-workbench.tsx:529). React 19 currently blocks
  // javascript: hrefs at render time, so this is not exploitable today, but the
  // public endpoint should only accept http(s) URLs.
  it("rejects a javascript: pageUrl from the public form", async () => {
    const payload = withChange(
      (b) => void (b.source.pageUrl = "javascript:alert(document.cookie)"),
    );

    const response = await fastify.inject({
      method: "POST",
      url: "/client-bookings",
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(mockCreateClientBooking).not.toHaveBeenCalled();
  });

  it("rejects a body without the form section", async () => {
    const { form: _form, ...payload } = validBooking();

    const response = await fastify.inject({
      method: "POST",
      url: "/client-bookings",
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(mockCreateClientBooking).not.toHaveBeenCalled();
  });

  it("stores the normalized booking with the request origin and skips an unconfigured webhook", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/client-bookings",
      headers: { origin: "https://goldencrowvs.com" },
      payload: validBooking(),
    });

    expect(response.statusCode).toBe(201);
    expect(mockCreateClientBooking).toHaveBeenCalledTimes(1);
    const [stored, meta] = mockCreateClientBooking.mock.calls[0];
    expect(stored.form.email).toBe("ada@example.com");
    expect(stored.source.referrer).toBeUndefined();
    expect(meta).toEqual({ origin: "https://goldencrowvs.com" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockRecordClientBookingWebhookNotification).toHaveBeenCalledWith(
      "booking-1",
      { status: "skipped", reason: "not_configured" },
    );
    expect(response.json()).toEqual({
      status: "ok",
      bookingId: "booking-1",
      notification: { status: "skipped", reason: "not_configured" },
    });
  });

  it("calls the configured webhook but never returns its URL or token", async () => {
    ENV.CLIENT_BOOKING_WEBHOOK_URL = WEBHOOK_URL;
    fetchSpy.mockResolvedValue(new Response("ok", { status: 200 }));

    const response = await fastify.inject({
      method: "POST",
      url: "/client-bookings",
      payload: validBooking(),
    });

    expect(response.statusCode).toBe(201);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(calledUrl.origin).toBe("https://hooks.example.com");
    expect(calledUrl.searchParams.get("token")).toBe(WEBHOOK_SECRET);
    expect(calledUrl.searchParams.get("booking_id")).toBe("booking-1");
    expect(calledUrl.searchParams.get("email")).toBe("ada@example.com");
    expect(response.json().notification).toMatchObject({
      status: "delivered",
      statusCode: 200,
    });
    expect(response.body).not.toContain(WEBHOOK_SECRET);
    expect(response.body).not.toContain("hooks.example.com");
  });

  it.each([
    ["a non-OK webhook response", () => fetchSpy.mockResolvedValue(new Response("nope", { status: 500 }))],
    ["a network failure", () => fetchSpy.mockRejectedValue(new TypeError("fetch failed"))],
  ])("answers 502 on %s, keeps the booking id, and leaks no webhook secret", async (_, arrange) => {
    ENV.CLIENT_BOOKING_WEBHOOK_URL = WEBHOOK_URL;
    arrange();

    const response = await fastify.inject({
      method: "POST",
      url: "/client-bookings",
      payload: validBooking(),
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      status: "notification_failed",
      bookingId: "booking-1",
      notification: { status: "failed" },
    });
    expect(response.body).not.toContain(WEBHOOK_SECRET);
    expect(response.body).not.toContain("hooks.example.com");
    expect(mockRecordClientBookingWebhookNotification).toHaveBeenCalledWith(
      "booking-1",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("still answers 201 when recording the webhook status fails", async () => {
    mockRecordClientBookingWebhookNotification.mockRejectedValue(
      new Error("firestore down"),
    );

    const response = await fastify.inject({
      method: "POST",
      url: "/client-bookings",
      payload: validBooking(),
    });

    expect(response.statusCode).toBe(201);
    expect(response.body).not.toContain("firestore down");
  });
});

describe("/admin/client-bookings (GOD MODE only)", () => {
  const adminRequests = [
    { method: "GET" as const, url: "/admin/client-bookings" },
    { method: "PATCH" as const, url: "/admin/client-bookings/booking-1/ack", payload: {} },
    { method: "PATCH" as const, url: "/admin/client-bookings/booking-1/archive", payload: {} },
  ];

  function expectNoAdminRepositoryCalls() {
    expect(mockListClientBookingsPage).not.toHaveBeenCalled();
    expect(mockListClientBookingsForCalendarMonth).not.toHaveBeenCalled();
    expect(mockAcknowledgeClientBooking).not.toHaveBeenCalled();
    expect(mockArchiveClientBooking).not.toHaveBeenCalled();
  }

  it.each(adminRequests)(
    "$method $url returns 401 without an admin context",
    async ({ method, url, payload }) => {
      const response = await fastify.inject({ method, url, payload });

      expect(response.statusCode).toBe(401);
      expectNoAdminRepositoryCalls();
    },
  );

  it.each([
    ["a full admin", makeAdminContext({ role: "full_admin" })],
    ["a 2PQ admin", makeAdminContext({ role: "2pq_admin" })],
    ["an institution admin", makeAdminContext({ role: "institution_admin" })],
    ["a patient", makeAdminContext({ role: "patient", canAccessBackoffice: false, canAccessPatientPortal: true })],
  ])("refuses %s (not bootstrap) with 403 on every admin endpoint", async (_, context) => {
    currentContext = context;

    for (const { method, url, payload } of adminRequests) {
      const response = await fastify.inject({ method, url, payload });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "GOD MODE access required" });
    }

    expectNoAdminRepositoryCalls();
  });

  it("lists unarchived bookings by default for GOD MODE", async () => {
    currentContext = GOD_MODE;
    mockListClientBookingsPage.mockResolvedValue({ bookings: [], nextCursor: null });

    const response = await fastify.inject({
      method: "GET",
      url: "/admin/client-bookings",
    });

    expect(response.statusCode).toBe(200);
    expect(mockListClientBookingsPage).toHaveBeenCalledWith({
      limit: undefined,
      cursor: undefined,
      ack: undefined,
      archived: false,
    });
  });

  it("passes list filters through", async () => {
    currentContext = GOD_MODE;
    mockListClientBookingsPage.mockResolvedValue({ bookings: [], nextCursor: null });

    await fastify.inject({
      method: "GET",
      url: "/admin/client-bookings?ack=false&archived=true&limit=25&cursor=2026-10-01T00%3A00%3A00.000Z",
    });

    expect(mockListClientBookingsPage).toHaveBeenCalledWith({
      limit: 25,
      cursor: "2026-10-01T00:00:00.000Z",
      ack: false,
      archived: true,
    });
  });

  it("uses the calendar listing for view=calendar", async () => {
    currentContext = GOD_MODE;
    mockListClientBookingsForCalendarMonth.mockResolvedValue({ bookings: [] });

    await fastify.inject({
      method: "GET",
      url: "/admin/client-bookings?view=calendar&month=2026-11",
    });

    expect(mockListClientBookingsForCalendarMonth).toHaveBeenCalledWith({
      month: "2026-11",
      limit: undefined,
      archived: false,
    });
    expect(mockListClientBookingsPage).not.toHaveBeenCalled();
  });

  it.each([
    "view=table",
    "month=2026-1",
    "limit=0",
    "limit=501",
    "cursor=yesterday",
    "ack=yes",
  ])("rejects ?%s with 400", async (query) => {
    currentContext = GOD_MODE;

    const response = await fastify.inject({
      method: "GET",
      url: `/admin/client-bookings?${query}`,
    });

    expect(response.statusCode).toBe(400);
    expectNoAdminRepositoryCalls();
  });

  it("acknowledges a booking as the GOD MODE email", async () => {
    currentContext = GOD_MODE;
    mockAcknowledgeClientBooking.mockResolvedValue({ id: "booking-1", ack: true });

    const response = await fastify.inject({
      method: "PATCH",
      url: "/admin/client-bookings/booking-1/ack",
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(mockAcknowledgeClientBooking).toHaveBeenCalledWith(
      "booking-1",
      "god@example.com",
    );
    expect(response.json()).toEqual({ booking: { id: "booking-1", ack: true } });
  });

  it("refuses to un-acknowledge (ack must be literal true)", async () => {
    currentContext = GOD_MODE;

    const response = await fastify.inject({
      method: "PATCH",
      url: "/admin/client-bookings/booking-1/ack",
      payload: { ack: false },
    });

    expect(response.statusCode).toBe(400);
    expect(mockAcknowledgeClientBooking).not.toHaveBeenCalled();
  });

  it("archives a booking as the GOD MODE email and maps a missing booking to 404", async () => {
    currentContext = GOD_MODE;
    mockArchiveClientBooking.mockRejectedValue(
      new AdminRepositoryError("Booking not found.", 404),
    );

    const response = await fastify.inject({
      method: "PATCH",
      url: "/admin/client-bookings/missing/archive",
      payload: { archived: true },
    });

    expect(response.statusCode).toBe(404);
    expect(mockArchiveClientBooking).toHaveBeenCalledWith(
      "missing",
      "god@example.com",
    );
  });
});
