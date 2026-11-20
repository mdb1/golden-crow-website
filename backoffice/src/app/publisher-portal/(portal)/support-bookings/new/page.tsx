import { redirect } from "next/navigation";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PublisherSupportBookingHero } from "@/components/publisher-support-booking-hero";
import { PublisherSupportBookingNew } from "@/components/publisher-support-booking-new";
import { getPublisherSupportBookingIdentity } from "@/lib/publisher-support-bookings-server";
import { PUBLISHER_PORTAL_HOME_ROUTE } from "@/lib/publisher-portal-routes";

type BookingQuery = {
  date?: string | string[];
  startTime?: string | string[];
};

function readRequestedSlot({ date, startTime }: BookingQuery) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      typeof startTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
    return undefined;
  }
  const day = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== date) return undefined;
  return { date, startTime };
}

export default async function PublisherSupportBookingNewPage({
  searchParams,
}: {
  searchParams: Promise<BookingQuery>;
}) {
  const [identity, query] = await Promise.all([getPublisherSupportBookingIdentity(), searchParams]);
  if (!identity) redirect(PUBLISHER_PORTAL_HOME_ROUTE);
  const requestedSlot = readRequestedSlot(query);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope header={<PublisherSupportBookingHero isNew />}>
        <PublisherSupportBookingNew
          key={JSON.stringify([identity.uid, requestedSlot])}
          identity={identity}
          requestedSlot={requestedSlot}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
