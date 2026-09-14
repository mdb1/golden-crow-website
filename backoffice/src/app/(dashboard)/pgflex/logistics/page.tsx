import { redirect } from "next/navigation";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { PGFlexLogisticsBrowser } from "@/components/pgflex-logistics-browser";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { appText } from "@/lib/language";
import {
  PGFLEX_LOGISTICS_PAGE_SIZE,
  canAccessPGFlexLogistics,
  type PGFlexLogisticsListScope,
  type PGFlexLogisticsPage as PGFlexLogisticsPagePayload,
} from "@/lib/pgflex-logistics";
import { getServerAppLanguage } from "@/lib/server-language";
import { sdkFetchServer } from "@/lib/sdk-server";

function normalizePGFlexLogisticsScope(
  value: string | string[] | undefined,
): PGFlexLogisticsListScope {
  return value === "finished" ? "finished" : "active";
}

export default async function PGFlexLogisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string | string[] }>;
}) {
  const { scope } = await searchParams;
  const initialScope = normalizePGFlexLogisticsScope(scope);
  const adminContext = await getAdminContextServer();
  if (!canAccessPGFlexLogistics(adminContext)) {
    redirect("/2pq-dashboard");
  }

  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);
  const initialPage = await sdkFetchServer<PGFlexLogisticsPagePayload>(
    `/pgflex/logistics?limit=${PGFLEX_LOGISTICS_PAGE_SIZE}&scope=${initialScope}`,
  );

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow="PGFlex"
            title={t("Logistics")}
            description={t("Standalone logistics dispatches and transport status.")}
          />
        }
      >
        <PGFlexLogisticsBrowser initialPage={initialPage} />
      </HeaderUnclutterScope>
    </div>
  );
}
