import { notFound } from "next/navigation";
import { CollectionBrowser } from "@/components/collection-browser";
import { FileStorageBrowser } from "@/components/file-storage/file-storage-browser";
import { HelperBanner } from "@/components/helper-banner";
import { PageHero } from "@/components/page-hero";
import { ReportCodesBrowser } from "@/components/reports/report-codes-browser";
import {
  getCollectionConfig,
  getSectionDescriptor,
} from "@/lib/moderation-config";
import { isCollectionKey } from "@/lib/moderation-utils";

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ collectionKey: string }>;
}) {
  const { collectionKey } = await params;

  if (!isCollectionKey(collectionKey)) {
    notFound();
  }

  const collection = getCollectionConfig(collectionKey);
  const section = getSectionDescriptor(collection.section);

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow={section?.label ?? "Data"}
        title={collection.title}
        description={collection.description}
      />
      <HelperBanner title={collection.helperTitle} tone={collection.accent}>
        {collection.helperBody}
      </HelperBanner>
      {collectionKey === "report_codes" ? (
        <ReportCodesBrowser />
      ) : collectionKey === "file_storage" ? (
        <FileStorageBrowser />
      ) : (
        <CollectionBrowser collectionKey={collectionKey} />
      )}
    </div>
  );
}
