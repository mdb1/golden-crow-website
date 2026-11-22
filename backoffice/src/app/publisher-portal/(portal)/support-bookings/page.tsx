import { redirect } from "next/navigation";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PublisherSupportBookingHero } from "@/components/publisher-support-booking-hero";
import { PublisherSupportBookingList } from "@/components/publisher-support-booking-list";
import {
  fetchPublisherSupportBookings,
  getPublisherSupportBookingIdentity,
} from "@/lib/publisher-support-bookings-server";
import { PUBLISHER_PORTAL_HOME_ROUTE } from "@/lib/publisher-portal-routes";

export default async function PublisherSupportBookingsPage() {
  const identity = await getPublisherSupportBookingIdentity();
  if (!identity) redirect(PUBLISHER_PORTAL_HOME_ROUTE);

  const firstPage = await fetchPublisherSupportBookings(identity.uid).catch(() => null);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope header={<PublisherSupportBookingHero />}>
        <PublisherSupportBookingList
          key={identity.uid}
          firstPage={firstPage}
          publisherUid={identity.uid}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
