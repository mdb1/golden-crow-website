import { redirect } from "next/navigation";
import { DiscoverIndividualWorkbench } from "@/components/discover/organization-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { requireDiscoverAccess } from "@/lib/discover-server";
import type { DiscoverIndividualRecord } from "@/lib/discover";
import { appText } from "@/lib/language";
import { sdkFetchServer } from "@/lib/sdk-server";
import { getServerAppLanguage } from "@/lib/server-language";

export default async function DiscoverIndividualDetailPage({
  params,
}: {
  params: Promise<{ individualId: string }>;
}) {
  const adminContext = await requireDiscoverAccess();
  if (adminContext.role === "organization_publisher") {
    redirect("/discover/organizations");
  }

  const { individualId } = await params;
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);

  let individual: DiscoverIndividualRecord;
  try {
    const response = await sdkFetchServer<{ individual: DiscoverIndividualRecord }>(
      `/discover/individuals/${encodeURIComponent(individualId)}`,
    );
    individual = response.individual;
  } catch {
    redirect("/discover/individuals");
  }

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Discover")}
            title={individual.name}
            description={t("Edit the canonical individual publisher record used by Discover feed entries.")}
          />
        }
      >
        <DiscoverIndividualWorkbench
          individual={individual}
          canManageSystemFields={adminContext.role === "full_admin"}
          canDeletePublisher={
            adminContext.role === "full_admin" && adminContext.isBootstrap
          }
        />
      </HeaderUnclutterScope>
    </div>
  );
}
