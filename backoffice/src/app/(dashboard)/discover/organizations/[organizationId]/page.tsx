import { redirect } from "next/navigation";
import { DiscoverOrganizationWorkbench } from "@/components/discover/organization-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { requireDiscoverAccess } from "@/lib/discover-server";
import type { DiscoverOrganizationRecord } from "@/lib/discover";
import { appText } from "@/lib/language";
import { sdkFetchServer } from "@/lib/sdk-server";
import { getServerAppLanguage } from "@/lib/server-language";

export default async function DiscoverOrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const adminContext = await requireDiscoverAccess();

  const { organizationId } = await params;
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);

  let organization: DiscoverOrganizationRecord;
  try {
    const response = await sdkFetchServer<{ organization: DiscoverOrganizationRecord }>(
      `/discover/organizations/${encodeURIComponent(organizationId)}`,
    );
    organization = response.organization;
  } catch {
    redirect("/discover/organizations");
  }

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Discover")}
            title={organization.name}
            description={t("Edit the canonical publisher record used by Discover feed entries.")}
          />
        }
      >
        <DiscoverOrganizationWorkbench
          organization={organization}
          canManageSystemFields={adminContext.role === "full_admin"}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
