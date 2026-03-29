import { notFound } from "next/navigation";
import { sdkFetchServer } from "@/lib/sdk-server";
import { HelperBanner } from "@/components/helper-banner";
import { PageHero } from "@/components/page-hero";
import { getUserRelatedLinks } from "@/lib/moderation-config";
import type { AdminUserRecord } from "@/lib/moderation-types";
import { UserWorkbench } from "@/components/user-workbench";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  // CRITICAL: params is a Promise in Next.js 16 — must await
  const { userId } = await params;

  let user: AdminUserRecord;
  try {
    const result = await sdkFetchServer<{ user: AdminUserRecord }>(`/users/${userId}`);
    user = result.user;
  } catch {
    notFound();
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
      <UserWorkbench user={user} relatedLinks={getUserRelatedLinks(user.uid)} />
    </div>
  );
}
