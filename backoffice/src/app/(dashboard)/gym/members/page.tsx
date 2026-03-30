import { PageHero } from "@/components/page-hero";
import { MembersTable } from "@/components/gym/members-table";

export default function GymMembersPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Gym"
        title="Members"
        description="Pocket Gyms member list. Click a member to view their profile, plans, and history."
      />
      <MembersTable />
    </div>
  );
}
