import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { TwoPQRecordWorkbench } from "@/components/two-pq-record-workbench";
import { Button } from "@/components/ui/button";
import { appText } from "@/lib/language";
import type { TwoPQDetailRecord } from "@/lib/two-pq-areas";
import { getTwoPQAreaConfig, translateTwoPQAreaConfig } from "@/lib/two-pq-areas";
import { getServerAppLanguage } from "@/lib/server-language";
import { sdkFetchServer } from "@/lib/sdk-server";
import { getTwoPQLookupData } from "@/lib/two-pq-server";

export default async function TwoPQAreaCreatePage({
  params,
  searchParams,
}: {
  params: Promise<{ areaKey: string }>;
  searchParams: Promise<{ batchId?: string; caseId?: string }>;
}) {
  const { areaKey } = await params;
  const { batchId, caseId } = await searchParams;
  const area = getTwoPQAreaConfig(areaKey);
  if (!area) {
    notFound();
  }
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);
  const translatedArea = translateTwoPQAreaConfig(area, language);

  let preloadedBatch: TwoPQDetailRecord["record"] | null = null;
  let preloadedCase: TwoPQDetailRecord["record"] | null = null;

  if (area.key === "cases" && batchId) {
    try {
      const detail = await sdkFetchServer<TwoPQDetailRecord>(
        `/2pq/sequencing/${encodeURIComponent(batchId)}`
      );
      preloadedBatch = detail.record;
    } catch {
      preloadedBatch = null;
    }
  }

  if (area.key === "sampling" && caseId) {
    try {
      const detail = await sdkFetchServer<TwoPQDetailRecord>(
        `/2pq/cases/${encodeURIComponent(caseId)}`
      );
      preloadedCase = detail.record;
    } catch {
      preloadedCase = null;
    }
  }

  const lookupData = await getTwoPQLookupData();

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow="2PQ"
            title={translatedArea.createLabel}
            description={`${t("Create a live Firestore document in")} ${area.collectionKey} ${t("with explicit institution, doctor, and patient linkage.")}`}
            actions={
              <Button variant="outline" size="sm" asChild>
                <Link href={area.route}>
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {t("Back to")} {translatedArea.navLabel.toLowerCase()}
                </Link>
              </Button>
            }
          />
        }
      >
        <TwoPQRecordWorkbench
          areaKey={area.key}
          institutions={lookupData.institutions}
          doctors={lookupData.doctors}
          patients={lookupData.patients}
          preloadedBatch={preloadedBatch}
          preloadedCase={preloadedCase}
          mode="create"
        />
      </HeaderUnclutterScope>
    </div>
  );
}
