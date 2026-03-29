import { notFound } from "next/navigation";
import { AreaAccessScreen } from "@/components/area-access-screen";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { getTwoPQAreaConfig } from "@/lib/two-pq-areas";

export default async function TwoPQAreaAccessPage({
  params,
}: {
  params: Promise<{ areaKey: string }>;
}) {
  const { areaKey } = await params;
  const area = getTwoPQAreaConfig(areaKey);

  if (!area) {
    notFound();
  }

  const adminContext = await getAdminContextServer();

  return (
    <AreaAccessScreen
      eyebrow="2PQ"
      title={`${area.navLabel} access`}
      description={`Review ${area.navLabel.toLowerCase()} role boundaries on their own screen before you open a live record.`}
      backHref={area.route}
      backLabel={`Back to ${area.navLabel}`}
      matrixTitle={`${area.navLabel} access`}
      matrixDescription="CRUD pills below reflect the current role boundary before a record is opened."
      entries={area.roleAccess}
      highlightRole={adminContext.role}
    />
  );
}
