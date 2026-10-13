// /gc-fitness/admin/corvo/reports/[uid]/[messageId] — the ONLY way an operator
// reads a Corvo conversation (#1330): through a report the user filed. The
// loader refuses unless `ai_coach/{uid}/reports/{messageId}` exists, shows at
// most 6 messages before the reported one, and logs the read to
// `admin_operations`.

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/gc-fitness/page-header";
import { loadCorvoReportContext } from "@/lib/gc-fitness/ai-coach-admin-actions";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

import { CorvoReportContextView } from "../../../_components/CorvoReportContextView";

export const generateMetadata = () => sectionMetadata("adminPanel");

export const dynamic = "force-dynamic";

export default async function CorvoReportPage({
  params,
}: {
  params: Promise<{ uid: string; messageId: string }>;
}) {
  try {
    await getCurrentAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") redirect("/gc-fitness/forbidden");
    throw err;
  }

  const { uid, messageId } = await params;
  const t = await getTranslations("corvoAdmin.context");
  const context = await loadCorvoReportContext(decodeURIComponent(uid), decodeURIComponent(messageId));

  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href="/gc-fitness/admin/corvo">
              <ArrowLeft className="h-4 w-4" />
              {t("back")}
            </Link>
          </Button>
        }
      />
      <CorvoReportContextView context={context} />
    </div>
  );
}
