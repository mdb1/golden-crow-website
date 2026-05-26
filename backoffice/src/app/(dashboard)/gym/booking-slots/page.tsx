import { PageHero } from "@/components/page-hero";
import { BookingSlotsTable } from "@/components/gym/booking-slots-table";

export default function GymBookingSlotsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Pocket Gyms"
        title="Coach availability"
        description="Manage the training slots athletes can request from the app."
      />
      <BookingSlotsTable />
    </div>
  );
}
