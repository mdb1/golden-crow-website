import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { HelperBanner } from "@/components/helper-banner";
import { PageHero } from "@/components/page-hero";
import { TwoPQRecordWorkbench } from "@/components/two-pq-record-workbench";
import { Button } from "@/components/ui/button";
import { getTwoPQAreaConfig } from "@/lib/two-pq-areas";
import { getTwoPQLookupData } from "@/lib/two-pq-server";

export default async function TwoPQAreaCreatePage({
  params,
}: {
  params: Promise<{ areaKey: string }>;
}) {
  const { areaKey } = await params;
  const area = getTwoPQAreaConfig(areaKey);
  if (!area) {
    notFound();
  }

  const lookupData = await getTwoPQLookupData();

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="2PQ"
        title={area.createLabel}
        description={`Create a live Firestore document in ${area.collectionKey} with explicit institution, doctor, and patient linkage.`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={area.route}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to {area.navLabel.toLowerCase()}
            </Link>
          </Button>
        }
      />
      <HelperBanner title="Create writes a real Firebase document." tone="blue">
        The workbench below sends a `POST` to the SDK and creates a new record in{" "}
        <code>{area.collectionKey}</code>. After creation, replace, update, and delete become
        available on the detail screen.
      </HelperBanner>
      <TwoPQRecordWorkbench
        areaKey={area.key}
        institutions={lookupData.institutions}
        doctors={lookupData.doctors}
        patients={lookupData.patients}
        mode="create"
      />
    </div>
  );
}
