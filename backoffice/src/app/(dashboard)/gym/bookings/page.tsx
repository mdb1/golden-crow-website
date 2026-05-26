import { PageHero } from "@/components/page-hero";
import { BookingsTable } from "@/components/gym/bookings-table";

export default function GymBookingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Pocket Gyms"
        title="Session requests"
        description="Review athlete bookings and their status. Filter by confirmed or cancelled."
      />
      <BookingsTable />
    </div>
  );
}
