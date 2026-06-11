import { notFound } from "next/navigation";
import { AreaAccessScreen } from "@/components/area-access-screen";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";
import { getSurfaceSpec } from "@/lib/two-pq-dashboard";

export default async function PatientAccessPage() {
  const adminContext = await getAdminContextServer();
  const surface = getSurfaceSpec("patients");

  if (!surface) {
    notFound();
  }
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <AreaAccessScreen
      eyebrow={t("Areas")}
      title={t("Patient access")}
      description="Review the patient CRUD boundary on its own screen before you open a patient record."
      backHref="/areas/patients"
      backLabel="Back to patients"
      matrixTitle="Patient access"
      matrixDescription="Patient records are where doctor-scoped CRUD becomes strictest, so the access pills stay visible before you open a record."
      entries={surface.roleAccess}
      highlightRole={adminContext.role}
    />
  );
}
