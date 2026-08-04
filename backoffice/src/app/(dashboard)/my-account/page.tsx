import { MyAccountWorkbench } from "@/components/my-account-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import type { MyAccountRecord } from "@/lib/admin-areas";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function MyAccountPage() {
  const { account } = await sdkFetchServer<{ account: MyAccountRecord }>(
    "/auth/my-account"
  );

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow="Access"
            title="My account"
            description="Your current role assignment, permission scope, and Firebase Auth state."
          />
        }
      >
        <MyAccountWorkbench initialAccount={account} />
      </HeaderUnclutterScope>
    </div>
  );
}
