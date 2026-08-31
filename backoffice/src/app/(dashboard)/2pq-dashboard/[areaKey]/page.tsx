import { notFound } from "next/navigation";
import { AreaAccessEntry } from "@/components/area-access-entry";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { TwoPQAreaBrowser } from "@/components/two-pq-area-browser";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { appText } from "@/lib/language";
import type { TwoPQListItem } from "@/lib/two-pq-areas";
import {
  getTwoPQAreaConfig,
  translateTwoPQAreaConfig,
} from "@/lib/two-pq-areas";
import { getServerAppLanguage } from "@/lib/server-language";
import { sdkFetchServer } from "@/lib/sdk-server";

const FORM_REQUESTED_CREATE_AREAS = new Set([
  "cases",
  "sampling",
  "sequencing",
]);

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
  const { records } = await sdkFetchServer<{ records: TwoPQListItem[] }>(
    `/2pq/${area.key}`,
  );
  const canCreate = area.roleAccess.some(
    (entry) =>
      entry.role === adminContext.role && entry.capabilities.includes("create"),
  );
  const directCreateRequiresForm =
    (adminContext.role === "institution_operator" ||
      adminContext.role === "institution_laboratory_staff") &&
    FORM_REQUESTED_CREATE_AREAS.has(area.key);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow="2PQ"
            title={translatedArea.label}
            description={translatedArea.summary}
          />
        }
      >
        <AreaAccessEntry
          accessHref={`${area.route}/access`}
          createHref={`${area.route}/new`}
          canCreate={canCreate && !directCreateRequiresForm}
          createLabel={translatedArea.createLabel}
          createBlockedAlert={
            directCreateRequiresForm
              ? "These entities cannot be created directly. They must be requested through the corresponding form."
              : undefined
          }
          createBlockedTitle="Use the corresponding form"
          createBlockedLinkHref="/2pq-dashboard"
          createBlockedLinkLabel="Go to 2PQ dashboard"
        />
        <TwoPQAreaBrowser
          areaKey={area.key}
          initialRecords={records}
          createdId={createdId}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
