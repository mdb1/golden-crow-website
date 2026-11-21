import type { FastifyInstance } from "fastify";
import { ClientBookingGoogleCalendarError } from "../lib/client-booking-google-calendar.js";
import { AdminRepositoryError } from "../repositories/admin-errors.js";
import type { AdminContext } from "../types/sdk.types.js";
import { buildRouteServer, makeAdminContext } from "./support/route-harness.js";

const mockConvertClientBookingToGoogleCalendar = jest.fn();

jest.mock("../repositories/client-bookings.repository.js", () => ({
  convertClientBookingToGoogleCalendar: mockConvertClientBookingToGoogleCalendar,
}));

const URL = "/admin/client-bookings/booking-1/google-calendar";

let currentContext: AdminContext | undefined;
let fastify: FastifyInstance;

beforeEach(async () => {
  mockConvertClientBookingToGoogleCalendar.mockReset();
  currentContext = undefined;
  const { clientBookingsRoutes } = await import("../routes/client-bookings.routes.js");
  fastify = await buildRouteServer(clientBookingsRoutes, () => currentContext);
});

afterEach(async () => {
  await fastify.close();
});

it("requires an authenticated session before converting a booking", async () => {
  const response = await fastify.inject({ method: "POST", url: URL });

  expect(response.statusCode).toBe(401);
  expect(mockConvertClientBookingToGoogleCalendar).not.toHaveBeenCalled();
});

it("prevents non-God-Mode users from converting bookings", async () => {
  currentContext = makeAdminContext({ isBootstrap: false });
  const response = await fastify.inject({ method: "POST", url: URL });

  expect(response.statusCode).toBe(403);
  expect(mockConvertClientBookingToGoogleCalendar).not.toHaveBeenCalled();
});

it("returns the updated booking to a God Mode operator", async () => {
  currentContext = makeAdminContext({ isBootstrap: true });
  const booking = {
    id: "booking-1",
    googleCalendar: {
      eventId: "event-1",
      htmlLink: "https://calendar.google.com/calendar/event?eid=event-1",
    },
  };
  mockConvertClientBookingToGoogleCalendar.mockResolvedValue(booking);

  const response = await fastify.inject({ method: "POST", url: URL });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ booking });
  expect(mockConvertClientBookingToGoogleCalendar).toHaveBeenCalledWith(booking.id);
});

it.each([
  new AdminRepositoryError("Booking not found", 404),
  new AdminRepositoryError("A calendar conversion is already in progress", 409),
  new ClientBookingGoogleCalendarError("Google Calendar authorization has not been configured.", 503),
])("returns a safe $statusCode booking conversion error", async (conversionError) => {
  currentContext = makeAdminContext({ isBootstrap: true });
  mockConvertClientBookingToGoogleCalendar.mockRejectedValue(conversionError);

  const response = await fastify.inject({ method: "POST", url: URL });

  expect(response.statusCode).toBe(conversionError.statusCode);
  expect(response.json()).toEqual({ error: conversionError.message });
});
