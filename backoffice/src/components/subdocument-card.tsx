import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AdminBadge } from "@/components/admin-badge";
import { Button } from "@/components/ui/button";
import type {
  CollectionKey,
  ModerationDocumentRecord,
  SubcollectionKey,
} from "@/lib/moderation-types";
import { compactList, formatDateTime, getString } from "@/lib/moderation-utils";

export function SubdocumentCard({
  collectionKey,
  documentId,
  subcollectionKey,
  document,
}: {
  collectionKey: CollectionKey;
  documentId: string;
  subcollectionKey: SubcollectionKey;
  document: ModerationDocumentRecord;
}) {
  const record =
    subcollectionKey === "comments"
      ? {
          title: getString(document.data.body) ?? document.id,
          subtitle:
            compactList([
              getString(document.data.authorEmail),
              getString(document.data.associatedReference),
            ]) || "Nested comment",
          timestamp: document.data.createdAt,
          badges: [
            {
              label: `${Number(document.data.score ?? 0)} score`,
              tone: "rose" as const,
            },
          ],
        }
      : {
          title: getString(document.data.summary) ?? document.id,
          subtitle:
            compactList([
              getString(document.data.type),
              getString(document.data.detailText),
            ]) || "Nested activity event",
          timestamp: document.data.createdAt,
          badges: [
            {
              label:
                document.data.is_public === false ? "Private event" : "Public event",
              tone:
                document.data.is_public === false
                  ? ("amber" as const)
                  : ("green" as const),
            },
          ],
        };

  return (
    <div className="glass-panel flex flex-col gap-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium text-foreground">{record.title}</h3>
        <span className="font-mono text-xs text-muted-foreground">
          {document.id}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{record.subtitle}</p>
      <div className="flex flex-wrap gap-2">
        {record.badges.map((badge) => (
          <AdminBadge key={`${document.id}-${badge.label}`} badge={badge} />
        ))}
        <span className="text-sm text-muted-foreground">
          {formatDateTime(record.timestamp) ?? "No timestamp"}
        </span>
      </div>
      <div className="flex">
        <Button variant="outline" size="sm" asChild>
          <Link
            href={`/collections/${collectionKey}/${documentId}/${subcollectionKey}/${document.id}`}
          >
            Open nested record
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
