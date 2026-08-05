import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/gc-fitness/page-header";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import {
  listCoachOptionsForAdmin,
  transferClientToCoach,
} from "@/lib/gc-fitness/admin-actions";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";
import {
  listCoachlessUsersWithStats,
  setUserEntitlementTier,
  deleteCoachlessUser,
} from "@/lib/gc-fitness/admin-coachless-actions";

import { CoachlessUsersTable } from "./_components/CoachlessUsersTable";
import { getTrainerTimezone } from "@/lib/gc-fitness/trainer-timezone";

export const generateMetadata = () => sectionMetadata("adminPanel");

export const dynamic = "force-dynamic";

const ROUTE = "/gc-fitness/admin/coach-less-users";

export default async function CoachlessUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    await getCurrentAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/forbidden");
    }
    throw err;
  }

  const sp = await searchParams;
  const op = typeof sp.op === "string" ? sp.op : null;
  const ok = sp.ok === "1";
  const actionMessage = op && ok ? `Action completed: ${op}.` : null;

  const [rows, coaches] = await Promise.all([
    listCoachlessUsersWithStats(),
    listCoachOptionsForAdmin(),
  ]);

  // Assigning a coach IS a transfer — from no coach to one. `transferClientToCoach`
  // already handles the null-coach origin (re-points the doc, moves the chat if
  // one exists, resyncs the coachId custom claim), so there's no second code path.
  async function assignCoachAction(formData: FormData) {
    "use server";
    const clientUid = String(formData.get("uid") ?? "");
    const newCoachUid = String(formData.get("newCoachUid") ?? "");
    await transferClientToCoach({ clientUid, newCoachUid });
    revalidatePath(ROUTE);
    revalidatePath(`/gc-fitness/admin/coaches/${newCoachUid}`);
    redirect(`${ROUTE}?op=assign_coach&ok=1`);
  }

  async function setTierAction(formData: FormData) {
    "use server";
    const uid = String(formData.get("uid") ?? "");
    const tier = String(formData.get("tier") ?? "");
    await setUserEntitlementTier({ uid, tier });
    revalidatePath(ROUTE);
    redirect(`${ROUTE}?op=set_${tier}&ok=1`);
  }

  async function deleteUserAction(formData: FormData) {
    "use server";
    const uid = String(formData.get("uid") ?? "");
    const emailConfirmation = String(formData.get("emailConfirmation") ?? "");
    await deleteCoachlessUser({ uid, emailConfirmation });
    revalidatePath(ROUTE);
    redirect(`${ROUTE}?op=delete_user&ok=1`);
  }

  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader
        title="Coach-less users"
        subtitle="Self-serve clients with no coach — subscription status, content stats, and god-mode actions (grant/revoke premium, delete). Search and sort the list; click a name to open their full profile."
      />

      <Button asChild variant="outline" size="sm" className="self-start rounded-full">
        <Link href="/gc-fitness/admin">
          <ArrowLeft className="h-4 w-4" />
          Back to admin
        </Link>
      </Button>

      {actionMessage ? (
        <div className="rounded-2xl border border-[color:var(--badge-success-border)] bg-[color:var(--badge-success-bg)] px-4 py-3 text-sm text-[color:var(--badge-success-fg)]">
          {actionMessage}
        </div>
      ) : null}

      {/* Search + sort are client-side view state over this already-loaded set
          (the coach-less segment is small), so typing never re-queries. */}
      <CoachlessUsersTable
        rows={rows}
        coaches={coaches}
        assignCoachAction={assignCoachAction}
        setTierAction={setTierAction}
        deleteUserAction={deleteUserAction}
        timezone={await getTrainerTimezone()}
      />
    </div>
  );
}
