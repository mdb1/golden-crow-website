import { redirect } from "next/navigation";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PublisherSupportBookingHero } from "@/components/publisher-support-booking-hero";
import { PublisherSupportBookingNew } from "@/components/publisher-support-booking-new";
import { getPublisherSupportBookingIdentity } from "@/lib/publisher-support-bookings-server";
import { PUBLISHER_PORTAL_HOME_ROUTE } from "@/lib/publisher-portal-routes";

export default async function PublisherSupportBookingNewPage() {
  const identity = await getPublisherSupportBookingIdentity();
  if (!identity) redirect(PUBLISHER_PORTAL_HOME_ROUTE);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope header={<PublisherSupportBookingHero isNew />}>
        <PublisherSupportBookingNew key={identity.uid} identity={identity} />
      </HeaderUnclutterScope>
    </div>
  );
}
