import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/gc-fitness/page-header";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { listCoachChecklistItems } from "@/lib/gc-fitness/coach-checklist-actions";
import { CoachChecklistClient } from "./CoachChecklistClient";

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
  const items = await listCoachChecklistItems();

  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("headerSubtitle")} />
      <CoachChecklistClient items={items} />
    </div>
  );
}
