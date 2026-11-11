import { PartnersBrowser } from "@/components/god-mode/partners-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";

export default function PartnersPage() {
  return (
    <div
      data-partners-page
      className="flex flex-col gap-6 xl:h-full xl:min-h-0 xl:overflow-hidden"
    >
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
