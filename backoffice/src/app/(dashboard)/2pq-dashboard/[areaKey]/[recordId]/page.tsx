import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { HelperBanner } from "@/components/helper-banner";
import { PageHero } from "@/components/page-hero";
import { TwoPQRecordWorkbench } from "@/components/two-pq-record-workbench";
import { Button } from "@/components/ui/button";
import type { TwoPQDetailRecord } from "@/lib/two-pq-areas";
import {
  getTwoPQAreaConfig,
  getTwoPQRecordSubtitle,
  getTwoPQRecordTitle,
} from "@/lib/two-pq-areas";
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
      <PageHero
        eyebrow="2PQ"
        title={getTwoPQRecordTitle(area, detail.record)}
        description={subtitle || `${area.label} detail and CRUD workbench.`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={area.route}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to {area.navLabel.toLowerCase()}
            </Link>
          </Button>
        }
      />
      <HelperBanner title={area.helperTitle} tone="blue">
        This screen is connected to <code>{area.collectionKey}</code>. Replace writes the full
        record shape, update patches only changed fields, and delete removes the Firestore
        document.
      </HelperBanner>
      <TwoPQRecordWorkbench
        areaKey={area.key}
        detail={detail}
        institutions={lookupData.institutions}
        doctors={lookupData.doctors}
        patients={lookupData.patients}
      />
    </div>
  );
}
