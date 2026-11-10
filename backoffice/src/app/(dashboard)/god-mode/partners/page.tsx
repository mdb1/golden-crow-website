import { PartnersBrowser } from "@/components/god-mode/partners-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";

export default function PartnersPage() {
  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow="GOD MODE"
            title="Partners"
            description="Partner contact cards."
          />
        }
      >
        <PartnersBrowser />
      </HeaderUnclutterScope>
    </div>
  );
}
