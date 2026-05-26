import { PageHero } from "@/components/page-hero";
import { MembersTable } from "@/components/gym/members-table";

export default function GymMembersPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Pocket Gyms"
        title="Athlete roster"
        description="Coach roster for reviewing athlete profiles, plans, evaluations, nutrition, and history."
      />
      <MembersTable />
    </div>
  );
}
