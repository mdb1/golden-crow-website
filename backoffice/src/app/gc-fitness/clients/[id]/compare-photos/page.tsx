import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { listProgressPhotosForClient } from "@/lib/gc-fitness/progress-photo-actions";
import { ProgressPhotoCompareEditor } from "./photo-compare-editor";

export const dynamic = "force-dynamic";

export default async function ComparePhotosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let trainer;
  try {
    trainer = await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") redirect("/gc-fitness/login");
    throw err;
  }

  const clientSnap = await gcFitnessFirestore().collection(FirestoreCollections.users).doc(id).get();
  if (!clientSnap.exists) notFound();
  const client = clientSnap.data() as {
    coachId?: string;
    displayName?: string;
    email?: string;
    timezone?: string;
  };
  if (client.coachId !== trainer.uid) notFound();

  const photos = await listProgressPhotosForClient(id);
  const timezone = client.timezone ?? "UTC";

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Comparador de fotos</h1>
          <p className="text-sm text-muted-foreground">{client.displayName ?? client.email ?? id}</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/gc-fitness/clients/${id}#progress-photos`}>Volver al perfil</Link>
        </Button>
      </div>
      <ProgressPhotoCompareEditor photos={photos} timezone={timezone} />
    </div>
  );
}
