import { AreaAccessEntry } from "@/components/area-access-entry";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { DoctorBrowser } from "@/components/areas/doctor-browser";
import { PageHero } from "@/components/page-hero";
import { getAdminContextServer } from "@/lib/admin-context-server";
import type { DoctorListItem } from "@/lib/admin-areas";
import { canCreateDoctorUi } from "@/lib/areas-ui";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function DoctorsPage() {
  const adminContext = await getAdminContextServer();
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);
  const { doctors } = await sdkFetchServer<{ doctors: DoctorListItem[] }>("/areas/doctors");

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Areas")}
            title={t("Doctors")}
            description={t("Institution-linked doctors with direct patient counts, role linkage, and a clear distinction between read-only peers and the doctor record you can actually edit.")}
          />
        }
      >
        <AreaAccessEntry
          accessHref="/areas/doctors/access"
          createHref="/areas/doctors/new"
          canCreate={canCreateDoctorUi(adminContext)}
          createLabel="Create doctor"
          description="Access review and doctor creation now start from their own dedicated screens instead of this main area page."
        />
        <DoctorBrowser initialDoctors={doctors} />
      </HeaderUnclutterScope>
    </div>
  );
}
