import { redirect } from "next/navigation";
import { ClientBookingsWorkbench } from "@/components/god-mode/client-bookings-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";

export default async function GodModeBookingsPage() {
  const adminContext = await getAdminContextServer();

  if (!adminContext.isBootstrap) {
    redirect("/2pq-dashboard");
  }
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow="GOD MODE"
            title={t("Client bookings")}
            description={t("Calendar and list review for consultation requests.")}
          />
        }
      >
        <ClientBookingsWorkbench />
      </HeaderUnclutterScope>
    </div>
  );
}
