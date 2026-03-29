import { redirect } from "next/navigation";
import { HelperBanner } from "@/components/helper-banner";
import { InstitutionWorkbench } from "@/components/areas/institution-workbench";
import { PageHero } from "@/components/page-hero";
import { getAdminContextServer } from "@/lib/admin-context-server";

export default async function NewInstitutionPage() {
  const adminContext = await getAdminContextServer();
  if (adminContext.role !== "full_admin") {
    redirect("/areas/institutions");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Areas"
        title="Create institution"
        description="Only full admins can create institution roots. Once created, the institution becomes the anchor for doctors, patients, and institution-scoped roles."
      />
      <HelperBanner title="Create the institution root first." tone="blue">
        Use a clear name, keep the relational id durable, and only add doctors or institution-admin roles after the institution record exists.
      </HelperBanner>
      <InstitutionWorkbench mode="create" />
    </div>
  );
}
