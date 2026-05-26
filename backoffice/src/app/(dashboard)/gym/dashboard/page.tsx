import { sdkFetchServer } from "@/lib/sdk-server";
import { PageHero } from "@/components/page-hero";
import { GymStatsCards } from "@/components/gym/gym-stats-cards";

interface GymStatsRecord {
  memberCount: number;
  activeTrainingPlanCount: number;
  upcomingBookingCount: number;
}

export default async function GymDashboardPage() {
  let stats: GymStatsRecord;

  try {
    stats = await sdkFetchServer<GymStatsRecord>("/gym/stats");
  } catch {
    return (
      <div className="flex flex-col gap-4">
        <PageHero
          eyebrow="Pocket Gyms"
          title="Coach dashboard"
          description="Pocket Gyms coach-side operations overview."
        />
        <p className="text-sm text-muted-foreground">
          Unable to load gym stats. Ensure the GoldenCrow SDK is running and the pocket-gyms project is selected.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHero
        eyebrow="Pocket Gyms"
        title="Coach dashboard"
        description="Pocket Gyms coach-side overview: athletes, active training plans, and upcoming sessions."
      />
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-foreground">Coach overview</h2>
        <GymStatsCards stats={stats} />
      </section>
    </div>
  );
}
