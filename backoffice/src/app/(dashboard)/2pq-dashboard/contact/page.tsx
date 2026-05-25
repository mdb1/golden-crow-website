import { PageHero } from "@/components/page-hero";
import { TwoPQContactSection } from "@/components/two-pq-contact-section";

export default function TwoPQContactPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="2PQ"
        title="Contact"
        description="Official channels for 2PQ operations, sample coordination, and administrative follow-up."
      />
      <TwoPQContactSection />
    </div>
  );
}
