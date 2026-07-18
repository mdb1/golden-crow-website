import { redirect } from "next/navigation";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { InstitutionWorkbench } from "@/components/areas/institution-workbench";
import { PageHero } from "@/components/page-hero";
import type { InstitutionDetailRecord } from "@/lib/admin-areas";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function InstitutionDetailPage({
  params,
}: {
  params: Promise<{ institutionId: string }>;
}) {
  const { institutionId } = await params;
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);

  let detail: InstitutionDetailRecord;

  try {
    detail = await sdkFetchServer<InstitutionDetailRecord>(
      `/areas/institutions/${encodeURIComponent(institutionId)}`
    );
  } catch {
    redirect("/areas/institutions");
  }

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Areas")}
            title={detail.institution.name}
            description={t("Institution detail is the control surface for institution descriptors, local doctors, and institution-admin role coverage.")}
          />
        }
      >
        <InstitutionWorkbench detail={detail} />
      </HeaderUnclutterScope>
    </div>
  );
}
