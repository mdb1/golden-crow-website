// Admin god-mode (READ-ONLY) progress-photo comparator for a coach's client.
// Reuses the trainer ProgressPhotoCompareEditor. Admin-gated at the page AND
// inside listProgressPhotosForClientAsAdmin, which verifies the client belongs
// to {uid}.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { listProgressPhotosForClientAsAdmin } from "@/lib/gc-fitness/progress-photo-actions";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { ProgressPhotoCompareEditor } from "@/app/gc-fitness/clients/[id]/compare-photos/photo-compare-editor";

export const dynamic = "force-dynamic";

export default async function AdminClientPhotosPage({
  params,
}: {
  params: Promise<{ uid: string; clientId: string }>;
}) {
  const { uid, clientId } = await params;

  try {
    await getCurrentAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") redirect("/gc-fitness/forbidden");
    throw err;
  }

  let photos: Awaited<ReturnType<typeof listProgressPhotosForClientAsAdmin>>;
  try {
    photos = await listProgressPhotosForClientAsAdmin(uid, clientId);
  } catch {
    notFound();
  }
  const clientSnap = await gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .doc(clientId)
    .get();
  const storedTimezone = clientSnap.get("timezone");
  const timezone =
    typeof storedTimezone === "string" && storedTimezone ? storedTimezone : "UTC";
  const clientName =
    (clientSnap.get("displayName") as string | undefined) ??
    (clientSnap.get("email") as string | undefined) ??
    clientId;

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Progress photos</h1>
          <Badge variant="secondary">Read-only</Badge>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1">
          <Link href={`/gc-fitness/admin/coaches/${uid}/clients/${clientId}`}>
            <ChevronLeft className="h-4 w-4" />
            Back to client
          </Link>
        </Button>
      </div>
      {photos.length > 0 ? (
        <ProgressPhotoCompareEditor
          photos={photos}
          timezone={timezone}
          clientName={clientName}
        />
      ) : (
        <p className="text-sm text-muted-foreground">No progress photos yet.</p>
      )}
    </div>
  );
}
