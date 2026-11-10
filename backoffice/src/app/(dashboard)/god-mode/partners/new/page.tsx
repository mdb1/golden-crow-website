import { PartnerEditor } from "@/components/god-mode/partners-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";

export default function NewPartnerPage() {
  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow="GOD MODE"
            title="New partner"
            description="Create a partner contact card."
          />
        }
      >
        <PartnerEditor />
      </HeaderUnclutterScope>
    </div>
  );
}
