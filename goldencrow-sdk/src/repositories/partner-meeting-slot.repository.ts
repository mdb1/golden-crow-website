import { randomInt } from "node:crypto";
import {
  isClientBookingDateAvailable,
  SUPPORT_BOOKING_CONTEXT,
  todayInBookingTimezone,
  type PartnerMeetingSlot,
} from "../lib/client-booking-schedule.js";
import { AdminRepositoryError } from "./admin-errors.js";
import { listClientBookingAvailability } from "./client-bookings.repository.js";

const MEETING_SEARCH_MONTHS = 3;
const WEEKDAYS_PER_WINDOW = 5;

export async function resolvePartnerMeetingSlot(requested?: PartnerMeetingSlot): Promise<PartnerMeetingSlot> {
  if (requested) {
    if (isClientBookingDateAvailable(requested.date) && requested.startTime < "12:00") {
      const { slotsByDate } = await listClientBookingAvailability(requested.date.slice(0, 7), SUPPORT_BOOKING_CONTEXT);
      if (slotsByDate[requested.date]?.includes(requested.startTime)) return requested;
    }
    throw new AdminRepositoryError("The proposed meeting time is no longer available. Refresh the invitation to choose another time.", 412);
  }

  const now = new Date();
  const today = todayInBookingTimezone(now);
  const date = new Date(`${today}T00:00:00Z`);
  const searchEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + MEETING_SEARCH_MONTHS, 1));
  date.setUTCDate(date.getUTCDate() + 1);

  const candidates: PartnerMeetingSlot[] = [];
  let weekdays = 0;
  let availability: Awaited<ReturnType<typeof listClientBookingAvailability>> | undefined;
  for (; date < searchEnd; date.setUTCDate(date.getUTCDate() + 1)) {
    const day = date.toISOString().slice(0, 10);
    if (!isClientBookingDateAvailable(day, now)) continue;
    const month = day.slice(0, 7);
    if (availability?.month !== month) {
      availability = await listClientBookingAvailability(month, SUPPORT_BOOKING_CONTEXT);
    }
    const morningTimes = (availability.slotsByDate[day] ?? []).filter(time => time < "12:00").sort();
    for (const startTime of morningTimes) {
      candidates.push({ date: day, startTime });
    }
    weekdays++;
    if (weekdays === WEEKDAYS_PER_WINDOW) {
      if (candidates.length) break;
      weekdays = 0;
    }
  }
  if (!candidates.length) throw new AdminRepositoryError("No weekday morning meeting slots are available.", 409);
  const index = candidates.length === 1 ? 0 : randomInt(1, candidates.length);
  return candidates[index]!;
}
