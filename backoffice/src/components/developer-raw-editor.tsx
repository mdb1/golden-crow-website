"use client";

import { AlertTriangle } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DocumentWorkbench } from "@/components/document-workbench";
import type { CollectionKey, ModerationDocumentRecord, RelatedRecordLink } from "@/lib/moderation-types";

export function DeveloperRawEditor({
  collectionKey,
  document,
  relatedLinks,
  backHref,
  backLabel,
  deleteHref,
  updateHref,
  title = "Developer raw editor",
  description = "Use this only for schema recovery, bulk cleanup, or fields that are not represented in the typed form yet.",
}: {
  collectionKey: CollectionKey;
  document: ModerationDocumentRecord;
  relatedLinks: RelatedRecordLink[];
  backHref: string;
  backLabel: string;
  deleteHref: string;
  updateHref: string;
  title?: string;
  description?: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <Accordion type="single" collapsible>
        <AccordionItem
          value="raw-editor"
          className="overflow-hidden rounded-2xl border border-border/80 bg-card/50 px-4"
        >
          <AccordionTrigger className="py-4 text-foreground hover:no-underline">
            Open raw JSON workbench
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="mb-4 rounded-2xl border border-amber-300/40 bg-amber-300/10 px-4 py-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-300/16 text-amber-700 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Developer-only fallback</p>
                  <p className="mt-1">
                    Prefer the typed form on this page. Raw JSON can bypass input
                    guards, mutate hidden fields, or remove linked data unexpectedly.
                  </p>
                </div>
              </div>
            </div>
            <DocumentWorkbench
              collectionKey={collectionKey}
              document={document}
              relatedLinks={relatedLinks}
              backHref={backHref}
              backLabel={backLabel}
              deleteHref={deleteHref}
              updateHref={updateHref}
              mode="embedded"
              title={title}
              description={description}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
