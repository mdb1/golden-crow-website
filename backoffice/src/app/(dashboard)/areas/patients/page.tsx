import { AreaAccessEntry } from "@/components/area-access-entry";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PatientBrowser } from "@/components/areas/patient-browser";
import { PageHero } from "@/components/page-hero";
import { getAdminContextServer } from "@/lib/admin-context-server";
import type { PatientListItem } from "@/lib/admin-areas";
import { canCreatePatientUi } from "@/lib/areas-ui";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function PatientsPage() {
  const adminContext = await getAdminContextServer();
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);
  const { patients } = await sdkFetchServer<{ patients: PatientListItem[] }>("/areas/patients");

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Areas")}
            title={t("Patients")}
            description={t("Searchable patient index with scoped visibility by institution and scoped edit rights by doctor ownership.")}
          />
        }
      >
        <AreaAccessEntry
          accessHref="/areas/patients/access"
          createHref="/areas/patients/new"
          canCreate={canCreatePatientUi(adminContext)}
          createLabel="Create patient"
        />
        <PatientBrowser initialPatients={patients} />
      </HeaderUnclutterScope>
    </div>
  );
}
