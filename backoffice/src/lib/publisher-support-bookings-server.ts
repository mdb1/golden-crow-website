import "server-only";

import { getAdminContextOrNull } from "@/lib/admin-context-server";
import {
  PUBLISHER_SUPPORT_BOOKING_API,
  type PublisherSupportBookingsPage,
} from "@/lib/publisher-support-bookings";
import { sdkFetchServer } from "@/lib/sdk-server";
import { getServerSession } from "@/lib/session";

const BOOKINGS_PAGE_SIZE = 20;

export async function getPublisherSupportBookingIdentity() {
  const session = await getServerSession();
  if (session?.user.accessSurface !== "publisher-portal") {
    return null;
  }

  const context = await getAdminContextOrNull(session.user.project);
  if (
    !context?.canAccessPublisherPortal ||
    context.canAccessBackoffice ||
    context.canAccessPatientPortal ||
    context.canAccessPGFlex ||
    !context.uid ||
    !context.email ||
    context.email.trim().toLowerCase() !== session.user.email?.trim().toLowerCase()
  ) {
    return null;
  }

  const linkedPublisher =
    (context.role === "organization_publisher" && context.organizationId?.trim()) ||
    (context.role === "individual_publisher" && context.individualId?.trim());

  return linkedPublisher
    ? {
        uid: context.uid,
        email: context.email,
        project: session.user.project ?? context.project,
        surface: "publisher-portal" as const,
      }
    : null;
}

export async function fetchPublisherSupportBookings(
  uid: string,
  cursor?: string,
): Promise<PublisherSupportBookingsPage> {
  const query = new URLSearchParams({ limit: String(BOOKINGS_PAGE_SIZE) });
  if (cursor) query.set("cursor", cursor);

  const page = await sdkFetchServer<PublisherSupportBookingsPage>(
    `${PUBLISHER_SUPPORT_BOOKING_API}?${query}`,
    { headers: { "x-expected-session-uid": uid } },
  );

  return {
    bookings: page.bookings.map(({ id, reason, event, googleCalendar }) => ({
      id,
      reason,
      event: { date: event.date, startTime: event.startTime, endTime: event.endTime },
      googleCalendar: googleCalendar && { meetLink: googleCalendar.meetLink },
    })),
    nextCursor: page.nextCursor,
  };
}
