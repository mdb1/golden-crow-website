import {
  clientBookingSlotEvent,
  clientBookingSlotTimes,
  isClientBookingDateAvailable,
} from "../lib/client-booking-schedule.js";

describe("client booking schedule", () => {
  it("uses Buenos Aires dates and only offers future weekdays", () => {
    const now = new Date("2026-11-20T01:30:00Z");
    expect(isClientBookingDateAvailable("2026-11-19", now)).toBe(false);
    expect(isClientBookingDateAvailable("2026-11-20", now)).toBe(true);
    expect(isClientBookingDateAvailable("2026-11-21", now)).toBe(false);
    expect(isClientBookingDateAvailable("2026-11-23", now)).toBe(true);
    expect(isClientBookingDateAvailable("2026-11-31", now)).toBe(false);
    expect(isClientBookingDateAvailable("2027-11-22", now)).toBe(true);
  });

  it("gives Pocket Genes consultations and support the established join-us schedule", () => {
    const date = "2026-11-23";
    const existingJoinUsTimes = [
      "09:00", "09:30", "10:00", "10:30", "11:00",
      "12:00", "12:30", "13:00", "13:30", "14:30",
    ];
    expect(clientBookingSlotTimes(date, "pocket-genes-join-us")).toEqual(existingJoinUsTimes);
    expect(clientBookingSlotTimes(date, "pocket-genes-support")).toEqual(existingJoinUsTimes);
    expect(clientBookingSlotTimes(date, "general", "/en/pocket-genes/join-us")).toEqual(existingJoinUsTimes);
    expect(clientBookingSlotTimes(date, "home")).toHaveLength(17);
  });

  it("normalizes times to a half-hour Buenos Aires meeting with matching UTC instants", () => {
    expect(clientBookingSlotEvent("2026-11-23", "09:30")).toEqual({
      date: "2026-11-23",
      startTime: "09:30",
      endTime: "10:00",
      startsAt: "2026-11-23T12:30:00.000Z",
      endsAt: "2026-11-23T13:00:00.000Z",
      timezone: "America/Argentina/Buenos_Aires",
      timezoneLabel: "Buenos Aires (GMT−3)",
      durationMinutes: 30,
    });
  });
});
