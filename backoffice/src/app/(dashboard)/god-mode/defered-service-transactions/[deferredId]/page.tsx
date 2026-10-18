import { redirect } from "next/navigation";
import { DeferredServiceTransactionWorkbench } from "@/components/god-mode/deferred-service-transactions-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { getAdminContextServer } from "@/lib/admin-context-server";

export default async function GodModeDeferredServiceTransactionDetailPage({
  params,
}: {
  params: Promise<{ deferredId: string }>;
}) {
  const adminContext = await getAdminContextServer();

  if (!adminContext.isBootstrap) {
    redirect("/2pq-dashboard");
  }

  const { deferredId } = await params;

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow="GOD MODE"
            title="Deferred Transaction"
            description="Edit the requester email and its deferred service transaction links."
          />
        }
      >
        <DeferredServiceTransactionWorkbench
          deferredId={decodeURIComponent(deferredId)}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
