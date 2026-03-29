import { notFound } from "next/navigation";
import { DocumentWorkbench } from "@/components/document-workbench";
import { HelperBanner } from "@/components/helper-banner";
import { PageHero } from "@/components/page-hero";
import {
  getCollectionConfig,
  getSectionDescriptor,
} from "@/lib/moderation-config";
import { sdkFetchServer } from "@/lib/sdk-server";
import type { ModerationDocumentRecord } from "@/lib/moderation-types";
import { isCollectionKey, isSubcollectionKey } from "@/lib/moderation-utils";

export default async function SubdocumentPage({
  params,
}: {
  params: Promise<{
    collectionKey: string;
    documentId: string;
    subcollectionKey: string;
    subdocumentId: string;
  }>;
}) {
  const { collectionKey, documentId, subcollectionKey, subdocumentId } =
    await params;

  if (!isCollectionKey(collectionKey) || !isSubcollectionKey(subcollectionKey)) {
    notFound();
  }

  const collection = getCollectionConfig(collectionKey);
  const section = getSectionDescriptor(collection.section);

  let document: ModerationDocumentRecord;
  try {
    const result = await sdkFetchServer<{ document: ModerationDocumentRecord }>(
      `/moderation/${collectionKey}/${documentId}/${subcollectionKey}/${subdocumentId}`
    );
    document = result.document;
  } catch {
    notFound();
  }

  const relatedLinks = [
    {
      label: "Parent document",
      href: `/collections/${collectionKey}/${documentId}`,
      description: "Return to the parent document workbench.",
      tone: collection.accent,
    },
    ...collection.getRelatedLinks(documentId, document.data),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow={section?.label ?? "Data"}
        title={`${subcollectionKey}: ${subdocumentId}`}
        description="Nested subdocument moderation workbench."
      />
      <HelperBanner title="Nested records can still have broad impact." tone={collection.accent}>
        Save and delete flows here affect live nested mobile app data such as
        post comments or community activity events.
      </HelperBanner>
      <DocumentWorkbench
        collectionKey={collectionKey}
        document={document}
        relatedLinks={relatedLinks}
        backHref={`/collections/${collectionKey}/${documentId}`}
        backLabel="Back to parent document"
        deleteHref={`/moderation/${collectionKey}/${documentId}/${subcollectionKey}/${subdocumentId}`}
        updateHref={`/moderation/${collectionKey}/${documentId}/${subcollectionKey}/${subdocumentId}`}
      />
    </div>
  );
}
