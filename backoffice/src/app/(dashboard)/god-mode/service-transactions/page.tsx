import { redirect } from "next/navigation";
import { SupportServicesBrowser } from "@/components/god-mode/support-services-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";

export default async function GodModeServiceTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ offerId?: string | string[] }>;
}) {
  const adminContext = await getAdminContextServer();

  if (!adminContext.isBootstrap) {
    redirect("/2pq-dashboard");
  }

  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);
  const resolvedSearchParams = await searchParams;
  const requestedOfferId = Array.isArray(resolvedSearchParams.offerId)
    ? resolvedSearchParams.offerId[0]
    : resolvedSearchParams.offerId;

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow="GOD MODE"
            title="Service Transactions"
            description={t(
              "Pocket Genes service request executions using pgr_* records.",
            )}
          />
        }
      >
        <SupportServicesBrowser
          kind="transactions"
          initialOfferIdFilter={requestedOfferId?.trim() ?? ""}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
