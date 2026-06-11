import { AreaAccessEntry } from "@/components/area-access-entry";
import { HelperBanner } from "@/components/helper-banner";
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
      <PageHero
        eyebrow={t("Areas")}
        title={t("Patients")}
        description={t("Searchable patient index with scoped visibility by institution and scoped edit rights by doctor ownership.")}
      />
      <HelperBanner title={t("Patients are informative backoffice records.")} tone="blue">
        {t("Patients appear here as institution and doctor-linked records for operations, but they do not access this admin themselves. Doctors can edit only their own patients.")}
      </HelperBanner>
      <AreaAccessEntry
        accessHref="/areas/patients/access"
        createHref="/areas/patients/new"
        canCreate={canCreatePatientUi(adminContext)}
        description="Access review and patient creation now start from their own dedicated screens instead of this main area page."
      />
      <PatientBrowser initialPatients={patients} />
    </div>
  );
}
