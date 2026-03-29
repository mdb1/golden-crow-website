import { HelperBanner } from "@/components/helper-banner";
import { PageHero } from "@/components/page-hero";
import { UserCommandDeck } from "@/components/user-command-deck";

export default function UsersPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Accounts"
        title="Account moderation"
        description="Firebase Auth users with direct access to the linked private profile moderation flow."
      />
      <HelperBanner title="Use the guided workbench first." tone="blue">
        The account screen edits Auth state and private profile fields together,
        while the raw collection browsers remain available for deeper inspection.
      </HelperBanner>
      <UserCommandDeck />
    </div>
  );
}
