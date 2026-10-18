import { redirect } from "next/navigation";
import { DeferredServiceTransactionsBrowser } from "@/components/god-mode/deferred-service-transactions-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { getAdminContextServer } from "@/lib/admin-context-server";

export default async function GodModeDeferredServiceTransactionsPage() {
  const adminContext = await getAdminContextServer();

  if (!adminContext.isBootstrap) {
    redirect("/2pq-dashboard");
  }

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow="GOD MODE"
            title="Deferred Transactions"
            description="Review email-based requester indexes and their linked service transactions."
          />
        }
      >
        <DeferredServiceTransactionsBrowser />
      </HeaderUnclutterScope>
    </div>
  );
}
