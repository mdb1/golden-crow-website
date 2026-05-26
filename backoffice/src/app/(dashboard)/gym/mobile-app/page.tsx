import { PageHero } from "@/components/page-hero";
import { HelperBanner } from "@/components/helper-banner";
import { PocketGymMobileAppWorkbench } from "@/components/gym/pocket-gym-mobile-app-workbench";

export default function GymMobileAppPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Pocket Gyms"
        title="iOS app mirror"
        description="Admin mirror for the Firebase collections used by the current PocketGym iOS app: users, persisted state, turnos, files, care team assignments, interactions, and shared community surfaces."
      />
      <HelperBanner title="Mirrors the shipped iOS app schema" tone="blue">
        The current PocketGym iOS target is configured against the
        MyDNAMap Firebase project, so this surface intentionally reads the
        app-specific <code>pocketgym_*</code> collections from that project
        instead of the older <code>gym_*</code> admin collections.
      </HelperBanner>
      <PocketGymMobileAppWorkbench />
    </div>
  );
}
