"use server";

import {
  fetchPublisherSupportBookings,
  getPublisherSupportBookingIdentity,
} from "@/lib/publisher-support-bookings-server";

export async function loadPublisherSupportBookingsPage(
  expectedUid: string,
  cursor: string,
) {
  const identity = await getPublisherSupportBookingIdentity();
  if (
    !identity ||
    identity.uid !== expectedUid ||
    typeof cursor !== "string" ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(cursor)
  ) {
    return null;
  }

  try {
    return await fetchPublisherSupportBookings(identity.uid, cursor);
  } catch {
    return null;
  }
}
