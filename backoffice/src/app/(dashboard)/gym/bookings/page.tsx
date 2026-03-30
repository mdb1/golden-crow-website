import { PageHero } from "@/components/page-hero";
import { BookingsTable } from "@/components/gym/bookings-table";

export default function GymBookingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Gym"
        title="Bookings"
        description="View all member bookings and their status. Filter by confirmed or cancelled."
      />
      <BookingsTable />
    </div>
  );
}
