"use client";

import { useQuery } from "@tanstack/react-query";
import { sdkFetch } from "@/lib/sdk-client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type GymDocumentType = "medical_cert" | "fitness_clearance" | "other";

interface GymDocumentRecord {
  id: string;
  name: string;
  type: GymDocumentType;
  uploadedAt: string;
  expiresAt: string | undefined;
  storagePath: string;
}

const typeLabel: Record<GymDocumentType, string> = {
  medical_cert: "Medical Cert",
  fitness_clearance: "Clearance",
  other: "Other",
};

export function DocumentsTab({ uid }: { uid: string }) {
  const documents = useQuery({
    queryKey: ["gym-documents", uid],
    queryFn: () =>
      sdkFetch<{ documents: GymDocumentRecord[] }>(
        `/gym/members/${uid}/documents`
      ),
  });

  return (
    <div className="mt-4 flex flex-col gap-3">
      {documents.isLoading && <Skeleton className="h-32 w-full" />}
      {documents.error && (
        <p className="text-sm text-destructive">Failed to load documents.</p>
      )}
      {documents.data && documents.data.documents.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No documents uploaded yet.
        </p>
      )}
      {documents.data && documents.data.documents.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {documents.data.documents.map((doc) => (
            <div
              key={doc.id}
              className="flex flex-col gap-2 rounded-lg border p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-tight">{doc.name}</p>
                <Badge variant="secondary" className="shrink-0">
                  {typeLabel[doc.type]}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
              </p>
              {doc.expiresAt && (
                <p className="text-xs text-muted-foreground">
                  Expires {new Date(doc.expiresAt).toLocaleDateString()}
                </p>
              )}
              <a
                href={doc.storagePath}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline-offset-4 hover:underline"
              >
                View File
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
