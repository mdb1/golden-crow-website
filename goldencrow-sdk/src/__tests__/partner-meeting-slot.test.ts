import { CLIENT_BOOKING_TIMEZONE, SUPPORT_BOOKING_CONTEXT } from "../lib/client-booking-schedule.js";
import { listClientBookingAvailability } from "../repositories/client-bookings.repository.js";
import { resolvePartnerMeetingSlot } from "../repositories/partner-meeting-slot.repository.js";

jest.mock("../repositories/client-bookings.repository.js", () => ({
  listClientBookingAvailability: jest.fn(),
}));

const availability = jest.mocked(listClientBookingAvailability);

function calendar(month: string, slotsByDate: Record<string, string[]>) {
  return { month, timezone: CLIENT_BOOKING_TIMEZONE, slotsByDate };
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date("2027-01-01T02:00:00Z"));
  availability.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

it("starts in the Buenos Aires month, crosses year end and picks the first available morning", async () => {
  availability
    .mockResolvedValueOnce(calendar("2026-12", {}))
    .mockResolvedValueOnce(calendar("2027-01", {
      "2027-01-01": ["12:00", "15:00"],
      "2027-01-04": ["10:30", "11:30", "12:30"],
    }));

  await expect(resolvePartnerMeetingSlot()).resolves.toEqual({ date: "2027-01-04", startTime: "10:30" });
  expect(availability.mock.calls).toEqual([["2026-12", SUPPORT_BOOKING_CONTEXT], ["2027-01", SUPPORT_BOOKING_CONTEXT]]);
});

it("rechecks the exact reviewed slot and rejects it once it is taken", async () => {
  const slot = { date: "2027-01-04", startTime: "10:30" };
  availability
    .mockResolvedValueOnce(calendar("2027-01", { [slot.date]: ["09:00", "10:30"] }))
    .mockResolvedValueOnce(calendar("2027-01", { [slot.date]: ["09:00"] }));

  await expect(resolvePartnerMeetingSlot(slot)).resolves.toEqual(slot);
  await expect(resolvePartnerMeetingSlot(slot)).rejects.toMatchObject({ statusCode: 412 });
});

it.each([
  ["2027-01-02", "09:00"],
  ["2027-01-04", "12:00"],
  ["2026-12-31", "09:30"],
])("rejects an ineligible proposal %s %s", async (date, startTime) => {
  await expect(resolvePartnerMeetingSlot({ date, startTime })).rejects.toMatchObject({ statusCode: 412 });
  expect(availability).not.toHaveBeenCalled();
});

it("stops the search when none of the upcoming months has a morning available", async () => {
  availability.mockImplementation(async month => calendar(month, {}));
  await expect(resolvePartnerMeetingSlot()).rejects.toMatchObject({ statusCode: 409 });
  expect(availability.mock.calls.map(([month]) => month)).toEqual(["2026-12", "2027-01", "2027-02"]);
});
