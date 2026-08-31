import { redirect } from "next/navigation";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { PGFlexLogisticsForm } from "@/components/pgflex-logistics-form";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { appText } from "@/lib/language";
import {
  canAccessPGFlexLogistics,
  type PGFlexLogisticsListItem,
} from "@/lib/pgflex-logistics";
import { getServerAppLanguage } from "@/lib/server-language";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function PGFlexLogisticsDetailPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const adminContext = await getAdminContextServer();
  if (!canAccessPGFlexLogistics(adminContext)) {
    redirect("/2pq-dashboard");
  }

  const { itemId } = await params;
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);

  let item: PGFlexLogisticsListItem;
  try {
    const payload = await sdkFetchServer<{ item: PGFlexLogisticsListItem }>(
      `/pgflex/logistics/${encodeURIComponent(itemId)}`,
    );
    item = payload.item;
  } catch {
    redirect("/pgflex/logistics");
  }

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow="PGFlex"
            title={item.identifier}
            description={t("Dispatch status, route, pickup time, and dispatcher assignment.")}
          />
        }
      >
        <PGFlexLogisticsForm item={item} />
      </HeaderUnclutterScope>
    </div>
  );
}
