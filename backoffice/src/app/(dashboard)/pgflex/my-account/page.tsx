import { MyAccountWorkbench } from "@/components/my-account-workbench";
import type { MyAccountRecord } from "@/lib/admin-areas";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function PGFlexMyAccountPage() {
  const { account } = await sdkFetchServer<{ account: MyAccountRecord }>(
    "/auth/my-account",
  );

  return (
    <MyAccountWorkbench initialAccount={account} showDiagnostics={false} />
  );
}
