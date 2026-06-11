import { notFound } from "next/navigation";
import { AreaAccessScreen } from "@/components/area-access-screen";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";
import { getTwoPQAreaConfig, translateTwoPQAreaConfig } from "@/lib/two-pq-areas";

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
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);
  const translatedArea = translateTwoPQAreaConfig(area, language);

  return (
    <AreaAccessScreen
      eyebrow="2PQ"
      title={`${translatedArea.navLabel} ${t("access")}`}
      description={`${t("Review role boundaries for")} ${translatedArea.navLabel.toLowerCase()} ${t("on their own screen before you open a live record.")}`}
      backHref={area.route}
      backLabel={`${t("Back to")} ${translatedArea.navLabel.toLowerCase()}`}
      matrixTitle={`${translatedArea.navLabel} ${t("access")}`}
      matrixDescription="CRUD pills below reflect the current role boundary before a record is opened."
      entries={area.roleAccess}
      highlightRole={adminContext.role}
    />
  );
}
