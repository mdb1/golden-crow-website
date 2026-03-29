import { AreaAccessEntry } from "@/components/area-access-entry";
import { HelperBanner } from "@/components/helper-banner";
import { DoctorBrowser } from "@/components/areas/doctor-browser";
import { PageHero } from "@/components/page-hero";
import { getAdminContextServer } from "@/lib/admin-context-server";
import type { DoctorListItem } from "@/lib/admin-areas";
import { canCreateDoctorUi } from "@/lib/areas-ui";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function DoctorsPage() {
  const adminContext = await getAdminContextServer();
  const { doctors } = await sdkFetchServer<{ doctors: DoctorListItem[] }>("/areas/doctors");

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Areas"
        title="Doctors"
        description="Institution-linked doctors with direct patient counts, role linkage, and a clear distinction between read-only peers and the doctor record you can actually edit."
      />
      <HelperBanner title="Doctors belong to exactly one institution." tone="blue">
        Institution admins can create and manage doctors inside their institution. Doctors can inspect peers in the same institution, but only edit their own doctor file.
      </HelperBanner>
      <AreaAccessEntry
        accessHref="/areas/doctors/access"
        createHref="/areas/doctors/new"
        canCreate={canCreateDoctorUi(adminContext)}
        description="Access review and doctor creation now start from their own dedicated screens instead of this main area page."
      />
      <DoctorBrowser initialDoctors={doctors} />
    </div>
  );
}
