import { notFound } from "next/navigation";
import { sdkFetchServer } from "@/lib/sdk-server";
import { PageHero } from "@/components/page-hero";
import { MemberWorkbench } from "@/components/gym/member-workbench";

interface GymMemberRecord {
  id: string;
  displayName: string;
  photoURL?: string;
  age?: string;
  gender?: string;
  goals: string[];
  memberSince: string;
  gymId: string;
}

export default async function GymMemberDetailPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = await params;

  let member: GymMemberRecord;
  try {
    const result = await sdkFetchServer<{ member: GymMemberRecord }>(
      `/gym/members/${uid}`
    );
    member = result.member;
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Gym"
        title={member.displayName}
        description="Gym member profile with training plans, evaluations, nutrition, and clinical history."
      />
      <MemberWorkbench member={member} />
    </div>
  );
}
