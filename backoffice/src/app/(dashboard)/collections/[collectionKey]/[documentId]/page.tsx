import { notFound, redirect } from "next/navigation";
import { CommunityUserWorkbench } from "@/components/community/community-user-workbench";
import { FileStorageWorkbench } from "@/components/file-storage/file-storage-workbench";
import { PublicProfileWorkbench } from "@/components/community/public-profile-workbench";
import { DocumentWorkbench } from "@/components/document-workbench";
import { HelperBanner } from "@/components/helper-banner";
import { PageHero } from "@/components/page-hero";
import { ReportOwnerWorkbench } from "@/components/reports/report-owner-workbench";
import {
  parseCommunityUserRecord,
  parsePublicProfileRecord,
} from "@/lib/community-admin";
import {
  getCollectionConfig,
  getSectionDescriptor,
} from "@/lib/moderation-config";
import { sdkFetchServer } from "@/lib/sdk-server";
import type { ModerationDocumentRecord } from "@/lib/moderation-types";
import { isCollectionKey } from "@/lib/moderation-utils";
import { parseStoredFileRecord } from "@/lib/file-storage";
import { parseReportOwnerRecord } from "@/lib/report-admin";

export default async function CollectionDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ collectionKey: string; documentId: string }>;
  searchParams: Promise<{ raw?: string }>;
}) {
  const [{ collectionKey, documentId }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);

  if (!isCollectionKey(collectionKey)) {
    notFound();
  }

  if (resolvedSearchParams.raw !== "1") {
    if (collectionKey === "community_posts") {
      redirect(`/community/${documentId}`);
    }

    if (collectionKey === "report_codes") {
      redirect(`/reports/${documentId}`);
    }

    if (collectionKey === "uploaded_reports") {
      redirect(`/reports/uploads/${documentId}`);
    }
  }

  const collection = getCollectionConfig(collectionKey);
  const section = getSectionDescriptor(collection.section);

  let document: ModerationDocumentRecord;
  try {
    const result = await sdkFetchServer<{ document: ModerationDocumentRecord }>(
      `/moderation/${collectionKey}/${documentId}`
    );
    document = result.document;
  } catch {
    notFound();
  }

  if (resolvedSearchParams.raw !== "1" && collectionKey === "report_owners") {
    const owner = parseReportOwnerRecord(document);

    return (
      <div className="flex flex-col gap-6">
        <PageHero
          eyebrow={section?.label ?? "Reports"}
          title={owner.ownerName || owner.ownerContactEmail || document.id}
          description="Typed report-owner editor for the clinician/admin profile used by the mobile app."
        />
        <HelperBanner title="Edit owner details without dropping into raw JSON." tone="green">
          Validate the contact fields, clinician profile, and terms state here
          first. The raw document editor remains available below only for
          developer-level recovery work.
        </HelperBanner>
        <ReportOwnerWorkbench document={document} />
      </div>
    );
  }

  if (resolvedSearchParams.raw !== "1" && collectionKey === "public_profiles") {
    const profile = parsePublicProfileRecord(document);

    return (
      <div className="flex flex-col gap-6">
        <PageHero
          eyebrow={section?.label ?? "Community"}
          title={profile.fullName || profile.username || document.id}
          description="Typed public-profile editor for the community-facing identity shown in the app."
        />
        <HelperBanner title="Edit the visible profile first, raw JSON second." tone="rose">
          Use this screen for name, condition, avatar, and icon changes that
          affect what people see in the community experience.
        </HelperBanner>
        <PublicProfileWorkbench document={document} />
      </div>
    );
  }

  if (resolvedSearchParams.raw !== "1" && collectionKey === "file_storage") {
    const file = parseStoredFileRecord(document);

    return (
      <div className="flex flex-col gap-6">
        <PageHero
          eyebrow={section?.label ?? "Reports"}
          title={file.fileName || document.id}
          description="Typed stored-file manager for the Firebase file_storage collection, with JSON validation and linked-report context."
        />
        <HelperBanner title="Manage stored files with the typed editor first." tone="green">
          Use this screen to review creator ownership, linked report code state,
          and JSON validity before editing the stored file content itself.
        </HelperBanner>
        <FileStorageWorkbench document={document} />
      </div>
    );
  }

  if (resolvedSearchParams.raw !== "1" && collectionKey === "community_users") {
    const communityUser = parseCommunityUserRecord(document);

    return (
      <div className="flex flex-col gap-6">
        <PageHero
          eyebrow={section?.label ?? "Community"}
          title={communityUser.username || communityUser.email || document.id}
          description="Typed community-user editor for identity, visibility, clinician state, and engagement stats."
        />
        <HelperBanner title="Keep the community identity operational and readable." tone="rose">
          Use the typed form for username, email, flags, owned reports, and
          stats. Raw JSON stays available only as a secondary fallback.
        </HelperBanner>
        <CommunityUserWorkbench document={document} />
      </div>
    );
  }

  const subdocuments =
    collection.subcollections?.length
      ? await Promise.all(
          collection.subcollections.map(async (subcollection) => {
            try {
              const response = await sdkFetchServer<{
                documents: ModerationDocumentRecord[];
              }>(
                `/moderation/${collectionKey}/${documentId}/${subcollection.key}`
              );

              return {
                key: subcollection.key,
                title: subcollection.title,
                description: subcollection.description,
                documents: response.documents,
              };
            } catch {
              return {
                key: subcollection.key,
                title: subcollection.title,
                description: subcollection.description,
                documents: [],
              };
            }
          })
        )
      : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow={section?.label ?? "Data"}
        title={document.id}
        description={`Raw moderation workbench for ${collection.title.toLowerCase()}.`}
      />
      <HelperBanner title={collection.helperTitle} tone={collection.accent}>
        {collection.helperBody}
      </HelperBanner>
      <DocumentWorkbench
        collectionKey={collectionKey}
        document={document}
        relatedLinks={collection.getRelatedLinks(documentId, document.data)}
        backHref={`/collections/${collectionKey}`}
        backLabel={`Back to ${collection.title.toLowerCase()}`}
        deleteHref={`/moderation/${collectionKey}/${documentId}`}
        updateHref={`/moderation/${collectionKey}/${documentId}`}
        subdocuments={subdocuments}
      />
    </div>
  );
}
