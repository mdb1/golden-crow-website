import { notFound } from "next/navigation";
import { AreaAccessEntry } from "@/components/area-access-entry";
import { HelperBanner } from "@/components/helper-banner";
import { PageHero } from "@/components/page-hero";
import { TwoPQAreaBrowser } from "@/components/two-pq-area-browser";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { appText } from "@/lib/language";
import type { TwoPQListItem } from "@/lib/two-pq-areas";
import { getTwoPQAreaConfig, translateTwoPQAreaConfig } from "@/lib/two-pq-areas";
import { getServerAppLanguage } from "@/lib/server-language";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function TwoPQAreaPage({
  params,
  searchParams,
}: {
  params: Promise<{ areaKey: string }>;
  searchParams: Promise<{ createdId?: string }>;
}) {
  const { areaKey } = await params;
  const { createdId } = await searchParams;
  const area = getTwoPQAreaConfig(areaKey);
  if (!area) {
    notFound();
  }
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);
  const translatedArea = translateTwoPQAreaConfig(area, language);

  const adminContext = await getAdminContextServer();
  const { records } = await sdkFetchServer<{ records: TwoPQListItem[] }>(`/2pq/${area.key}`);
  const canCreate = area.roleAccess.some(
    (entry) =>
      entry.role === adminContext.role && entry.capabilities.includes("create")
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="2PQ"
        title={translatedArea.label}
        description={translatedArea.summary}
      />
      <HelperBanner title={translatedArea.helperTitle} tone="blue">
        {translatedArea.helperBody} {t("Live documents in")} <code>{area.collectionKey}</code>{" "}
        {t("stay scoped to the same institution, doctor, and patient permission lanes already enforced by the SDK.")}
      </HelperBanner>
      <AreaAccessEntry
        accessHref={`${area.route}/access`}
        createHref={`${area.route}/new`}
        canCreate={canCreate}
        createLabel={translatedArea.createLabel}
        description={t("Access review and record creation now start from their own dedicated screens instead of this main area page.")}
      />
      <TwoPQAreaBrowser areaKey={area.key} initialRecords={records} createdId={createdId} />
    </div>
  );
}
