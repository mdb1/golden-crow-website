import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/gc-fitness/page-header";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { listCoachChecklistItems } from "@/lib/gc-fitness/coach-checklist-actions";
import { listClients } from "@/lib/gc-fitness/client-roster";
import { CoachChecklistClient } from "./CoachChecklistClient";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

// Tab title: "GC Fitness - <checklist>" (issue #170).
export const generateMetadata = () => sectionMetadata("checklist");

export const dynamic = "force-dynamic";

export default async function CoachChecklistPage() {
  try {
    await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }
  const t = await getTranslations("coachChecklist");
  const [items, roster] = await Promise.all([
    listCoachChecklistItems(),
    listClients(),
  ]);
  // Only real (signed-in) clients can be linked — pending/mirror entries have a
  // synthetic `mirror:` uid that isn't a valid client route.
  const clients = roster
    .filter((c) => !c.pendingProvisioning)
    .map((c) => ({
      uid: c.uid,
      displayName: c.displayName,
      photoURL: c.photoURL,
    }));

  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("headerSubtitle")} />
      <CoachChecklistClient items={items} clients={clients} />
    </div>
  );
}
