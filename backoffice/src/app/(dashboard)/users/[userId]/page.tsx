import { notFound } from "next/navigation";
import { sdkFetchServer } from "@/lib/sdk-server";
import { HelperBanner } from "@/components/helper-banner";
import { PageHero } from "@/components/page-hero";
import { getUserRelatedLinks } from "@/lib/moderation-config";
import type { AdminUserRecord } from "@/lib/moderation-types";
import { UserWorkbench } from "@/components/user-workbench";
import { UserAccessPanel } from "@/components/users/user-access-panel";
import type { RoleManagementRecord } from "@/lib/admin-areas";
import { getAdminContextServer } from "@/lib/admin-context-server";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  // CRITICAL: params is a Promise in Next.js 16 — must await
  const { userId } = await params;

  let user: AdminUserRecord;
  const adminContext = await getAdminContextServer();
  try {
    const result = await sdkFetchServer<{ user: AdminUserRecord }>(
      `/users/${encodeURIComponent(userId)}`
    );
    user = result.user;
  } catch {
    notFound();
  }

  let roleRecord: RoleManagementRecord | null = null;
  if (user.email.trim()) {
    try {
      const result = await sdkFetchServer<{ role: RoleManagementRecord }>(
        `/roles/${encodeURIComponent(user.email)}`
      );
      roleRecord = result.role;
    } catch {
      roleRecord = null;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Accounts"
        title={user.displayName || user.email || user.uid}
        description="Guided account moderation across Firebase Auth and the linked private profile document."
      />
      <HelperBanner title="Check related records after changes." tone="blue">
        Public profiles, community users, report owners, and learning progress
        are separate documents even when they share the same uid.
      </HelperBanner>
      <UserAccessPanel
        adminContext={adminContext}
        roleRecord={roleRecord}
        user={user}
      />
      <UserWorkbench user={user} relatedLinks={getUserRelatedLinks(user.uid)} />
    </div>
  );
}
