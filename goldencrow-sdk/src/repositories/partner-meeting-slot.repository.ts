import {
  isClientBookingDateAvailable,
  SUPPORT_BOOKING_CONTEXT,
  todayInBookingTimezone,
  type PartnerMeetingSlot,
} from "../lib/client-booking-schedule.js";
import { AdminRepositoryError } from "./admin-errors.js";
import { listClientBookingAvailability } from "./client-bookings.repository.js";

const MEETING_SEARCH_MONTHS = 3;

export async function resolvePartnerMeetingSlot(requested?: PartnerMeetingSlot): Promise<PartnerMeetingSlot> {
  if (requested) {
    if (isClientBookingDateAvailable(requested.date) && requested.startTime < "12:00") {
      const { slotsByDate } = await listClientBookingAvailability(requested.date.slice(0, 7), SUPPORT_BOOKING_CONTEXT);
      if (slotsByDate[requested.date]?.includes(requested.startTime)) return requested;
    }
    throw new AdminRepositoryError("The proposed meeting time is no longer available. Refresh the invitation to choose another time.", 412);
  }

  const currentMonth = todayInBookingTimezone(new Date()).slice(0, 7);
  const monthStart = new Date(`${currentMonth}-01T00:00:00Z`);
  for (let offset = 0; offset < MEETING_SEARCH_MONTHS; offset++) {
    const month = monthStart.toISOString().slice(0, 7);
    const { slotsByDate } = await listClientBookingAvailability(month, SUPPORT_BOOKING_CONTEXT);
    for (const [date, times] of Object.entries(slotsByDate)) {
      const startTime = times.find(time => time < "12:00");
      if (startTime) return { date, startTime };
    }
    monthStart.setUTCMonth(monthStart.getUTCMonth() + 1);
  }
  throw new AdminRepositoryError("No weekday morning meeting slots are available.", 409);
}
