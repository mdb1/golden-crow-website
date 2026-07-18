import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { TwoPQRecordWorkbench } from "@/components/two-pq-record-workbench";
import { Button } from "@/components/ui/button";
import { appText } from "@/lib/language";
import type { TwoPQDetailRecord } from "@/lib/two-pq-areas";
import {
  getTwoPQAreaConfig,
  getTwoPQRecordSubtitle,
  getTwoPQRecordTitle,
  translateTwoPQAreaConfig,
} from "@/lib/two-pq-areas";
import { getServerAppLanguage } from "@/lib/server-language";
import { sdkFetchServer } from "@/lib/sdk-server";
import { getTwoPQLookupData } from "@/lib/two-pq-server";

export default async function TwoPQAreaDetailPage({
  params,
}: {
  params: Promise<{ areaKey: string; recordId: string }>;
}) {
  const { areaKey, recordId } = await params;
  const area = getTwoPQAreaConfig(areaKey);
  if (!area) {
    notFound();
  }
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);
  const translatedArea = translateTwoPQAreaConfig(area, language);

  let detail: TwoPQDetailRecord;
  try {
    detail = await sdkFetchServer<TwoPQDetailRecord>(
      `/2pq/${area.key}/${encodeURIComponent(recordId)}`
    );
  } catch {
    redirect(area.route);
  }

  const lookupData = await getTwoPQLookupData();
  const subtitle = getTwoPQRecordSubtitle(area, detail.record);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow="2PQ"
            title={getTwoPQRecordTitle(area, detail.record)}
            description={subtitle || `${translatedArea.label} ${t("detail and CRUD workbench.")}`}
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
          detail={detail}
          institutions={lookupData.institutions}
          doctors={lookupData.doctors}
          patients={lookupData.patients}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
