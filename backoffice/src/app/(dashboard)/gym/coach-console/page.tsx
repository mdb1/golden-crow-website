import { PageHero } from "@/components/page-hero";
import { HelperBanner } from "@/components/helper-banner";
import { PocketGymMobileAppWorkbench } from "@/components/gym/pocket-gym-mobile-app-workbench";

export default function GymCoachConsolePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Pocket Gyms"
        title="Coach console"
        description="Coach-facing operations for Pocket Gym: athlete signals, turno review, attachment review, care-team context, and activity history that complement the user app."
      />
      <HelperBanner title="Built for the coach side of the circuit" tone="blue">
        The user app stays focused on logging, requesting, uploading, and
        tracking progress. This backoffice surface gives coaches the matching
        operational view: who needs attention, which turnos need a decision,
        what files were uploaded, and what signals are changing across each
        athlete.
      </HelperBanner>
      <PocketGymMobileAppWorkbench />
    </div>
  );
}
