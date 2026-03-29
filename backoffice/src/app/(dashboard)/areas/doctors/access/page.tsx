import { notFound } from "next/navigation";
import { AreaAccessScreen } from "@/components/area-access-screen";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { getSurfaceSpec } from "@/lib/two-pq-dashboard";

export default async function DoctorAccessPage() {
  const adminContext = await getAdminContextServer();
  const surface = getSurfaceSpec("doctors");

  if (!surface) {
    notFound();
  }

  return (
    <AreaAccessScreen
      eyebrow="Areas"
      title="Doctor access"
      description="Review the doctor role boundary on its own screen before you open a doctor workbench."
      backHref="/areas/doctors"
      backLabel="Back to doctors"
      matrixTitle="Doctor access"
      matrixDescription="Doctor records use assigned-scope edit rules, and the pills below show that before you open a workbench."
      entries={surface.roleAccess}
      highlightRole={adminContext.role}
    />
  );
}
