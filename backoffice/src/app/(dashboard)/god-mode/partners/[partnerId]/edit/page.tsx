import { PartnerEditor } from "@/components/god-mode/partners-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";

export default async function EditPartnerPage({
  params,
}: {
  params: Promise<{ partnerId: string }>;
}) {
  const { partnerId } = await params;
  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow="GOD MODE"
            title="Edit partner"
            description="Edit a partner contact card."
          />
        }
      >
        <PartnerEditor partnerId={partnerId} />
      </HeaderUnclutterScope>
    </div>
  );
}
