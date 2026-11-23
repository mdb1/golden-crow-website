import { CLIENT_BOOKING_TIMEZONE, SUPPORT_BOOKING_CONTEXT } from "../lib/client-booking-schedule.js";
import { listClientBookingAvailability } from "../repositories/client-bookings.repository.js";
import { resolvePartnerMeetingSlot } from "../repositories/partner-meeting-slot.repository.js";

const mockRandomIndex = jest.fn();

jest.mock("node:crypto", () => ({
  ...jest.requireActual("node:crypto"),
  randomInt: (lower: number, upper: number) => mockRandomIndex(lower, upper),
}));

jest.mock("../repositories/client-bookings.repository.js", () => ({
  listClientBookingAvailability: jest.fn(),
}));

const availability = jest.mocked(listClientBookingAvailability);

function calendar(month: string, slotsByDate: Record<string, string[]>) {
  return { month, timezone: CLIENT_BOOKING_TIMEZONE, slotsByDate };
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date("2026-12-31T02:00:00Z"));
  availability.mockReset();
  mockRandomIndex.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

it.each([
  [1, "2026-12-31", "10:30"],
  [2, "2027-01-04", "09:00"],
  [3, "2027-01-04", "11:30"],
  [4, "2027-01-06", "09:30"],
] as const)("draws candidate %i from five Buenos Aires weekdays, skipping the earliest slot", async (index, date, startTime) => {
  availability
    .mockResolvedValueOnce(calendar("2026-12", {
      "2026-12-30": ["10:30"],
      "2026-12-31": ["10:30", "09:00"],
    }))
    .mockResolvedValueOnce(calendar("2027-01", {
      "2027-01-01": ["12:00", "15:00"],
      "2027-01-02": ["09:00"],
      "2027-01-04": ["09:00", "11:30", "12:30"],
      "2027-01-06": ["09:30"],
      "2027-01-07": ["11:00"],
    }));
  mockRandomIndex.mockReturnValue(index);
  await expect(resolvePartnerMeetingSlot()).resolves.toEqual({ date, startTime });
  expect(mockRandomIndex).toHaveBeenCalledWith(1, 5);
  expect(availability.mock.calls).toEqual([["2026-12", SUPPORT_BOOKING_CONTEXT], ["2027-01", SUPPORT_BOOKING_CONTEXT]]);
});

it("uses the next five weekdays when the first five have no mornings left", async () => {
  jest.setSystemTime(new Date("2027-01-08T18:00:00Z"));
  availability.mockResolvedValue(calendar("2027-01", {
    "2027-01-11": ["14:00"],
    "2027-01-18": ["09:00"],
    "2027-01-22": ["10:30"],
    "2027-01-25": ["11:00"],
  }));
  mockRandomIndex.mockReturnValue(1);
  await expect(resolvePartnerMeetingSlot()).resolves.toEqual({ date: "2027-01-22", startTime: "10:30" });
  expect(mockRandomIndex).toHaveBeenCalledWith(1, 2);
  expect(availability).toHaveBeenCalledTimes(1);
});

it("keeps the first slot when it is the only available morning", async () => {
  jest.setSystemTime(new Date("2027-01-08T18:00:00Z"));
  availability.mockResolvedValue(calendar("2027-01", { "2027-01-11": ["09:00", "12:00"] }));

  await expect(resolvePartnerMeetingSlot()).resolves.toEqual({ date: "2027-01-11", startTime: "09:00" });
  expect(mockRandomIndex).not.toHaveBeenCalled();
});

it("rechecks the exact reviewed slot and rejects it once it is taken", async () => {
  const slot = { date: "2027-01-04", startTime: "10:30" };
  availability
    .mockResolvedValueOnce(calendar("2027-01", { [slot.date]: ["09:00", "10:30"] }))
    .mockResolvedValueOnce(calendar("2027-01", { [slot.date]: ["09:00"] }));

  await expect(resolvePartnerMeetingSlot(slot)).resolves.toEqual(slot);
  await expect(resolvePartnerMeetingSlot(slot)).rejects.toMatchObject({ statusCode: 412 });
  expect(mockRandomIndex).not.toHaveBeenCalled();
});

it.each([
  ["2027-01-02", "09:00"],
  ["2027-01-04", "12:00"],
  ["2026-12-30", "09:30"],
])("rejects an ineligible proposal %s %s", async (date, startTime) => {
  await expect(resolvePartnerMeetingSlot({ date, startTime })).rejects.toMatchObject({ statusCode: 412 });
  expect(availability).not.toHaveBeenCalled();
});

it("stops the search when none of the upcoming months has a morning available", async () => {
  availability.mockImplementation(async month => calendar(month, {}));
  await expect(resolvePartnerMeetingSlot()).rejects.toMatchObject({ statusCode: 409 });
  expect(availability.mock.calls.map(([month]) => month)).toEqual(["2026-12", "2027-01", "2027-02"]);
});
