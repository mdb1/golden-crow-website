import { notFound } from "next/navigation";
import { AreaAccessScreen } from "@/components/area-access-screen";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { getSurfaceSpec } from "@/lib/two-pq-dashboard";

export default async function InstitutionAccessPage() {
  const adminContext = await getAdminContextServer();
  const surface = getSurfaceSpec("institutions");

  if (!surface) {
    notFound();
  }

  return (
    <AreaAccessScreen
      eyebrow="Areas"
      title="Institution access"
      description="Review the institution scope boundary on its own screen before you open the live institution surface."
      backHref="/areas/institutions"
      backLabel="Back to institutions"
      matrixTitle="Institution access"
      matrixDescription="The same permission rules shown in the 2PQ dashboard apply here on the live institution surface."
      entries={surface.roleAccess}
      highlightRole={adminContext.role}
    />
  );
}
