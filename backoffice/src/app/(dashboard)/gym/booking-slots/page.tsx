import { PageHero } from "@/components/page-hero";
import { BookingSlotsTable } from "@/components/gym/booking-slots-table";

export default function GymBookingSlotsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Gym"
        title="Booking Slots"
        description="Manage available training time slots. Add, edit, or remove slots as needed."
      />
      <BookingSlotsTable />
    </div>
  );
}
