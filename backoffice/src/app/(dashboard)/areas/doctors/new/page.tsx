import { redirect } from "next/navigation";
import { DoctorWorkbench } from "@/components/areas/doctor-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { getAdminContextServer } from "@/lib/admin-context-server";
import type { InstitutionRecord } from "@/lib/admin-areas";
import { canCreateDoctorUi } from "@/lib/areas-ui";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function NewDoctorPage({
  searchParams,
}: {
  searchParams: Promise<{ institutionId?: string }>;
}) {
  const adminContext = await getAdminContextServer();
  const { institutionId } = await searchParams;
  if (!canCreateDoctorUi(adminContext, institutionId)) {
    redirect("/areas/doctors");
  }
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);
  const { institutions } = await sdkFetchServer<{ institutions: InstitutionRecord[] }>(
    "/areas/institutions"
  );

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Areas")}
            title={t("Create doctor")}
            description={t("Create a doctor record tied to one institution. The rest of the doctor setup happens after the record exists.")}
          />
        }
      >
        <DoctorWorkbench
          mode="create"
          institutions={institutions}
          initialInstitutionId={institutionId}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
