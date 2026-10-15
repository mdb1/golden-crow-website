"use server";

// actions.ts
//
// #382 — the coach-less profile's form actions (formerly inline in page.tsx).
// Inline "use server" closures are named by POSITION ($$RSC_SERVER_ACTION_N),
// so adding or reordering one in the page re-pointed an old tab's action ID at
// a DIFFERENT closure — measured: "promote to admin" ran "add to allowlist".
// Named exports here keep their ID while their name and file don't change.
// Only async functions may be exported from this file (`next build` rejects
// anything else).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { transferClientToCoach } from "@/lib/gc-fitness/admin-actions";
import {
  deleteCoachlessUser,
  setUserEntitlementTier,
} from "@/lib/gc-fitness/admin-coachless-actions";

const LIST_ROUTE = "/gc-fitness/admin/coach-less-users";

// Assigning a coach IS a transfer — from no coach to one. Reuses the tested
// `transferClientToCoach` (doc re-point + chat move + coachId claim resync)
// rather than adding a second write path. Afterwards this profile 404s (the
// user is no longer coach-less), so land on their coached drill-down instead.
export async function assignCoachAction(formData: FormData) {
  const clientUid = String(formData.get("uid") ?? "");
  const newCoachUid = String(formData.get("newCoachUid") ?? "");
  await transferClientToCoach({ clientUid, newCoachUid });
  revalidatePath(LIST_ROUTE);
  revalidatePath(`/gc-fitness/admin/coaches/${newCoachUid}`);
  redirect(`/gc-fitness/admin/coaches/${newCoachUid}/clients/${clientUid}`);
}

export async function setTierAction(formData: FormData) {
  const targetUid = String(formData.get("uid") ?? "");
  const nextTier = String(formData.get("tier") ?? "");
  await setUserEntitlementTier({ uid: targetUid, tier: nextTier });
  revalidatePath(`${LIST_ROUTE}/${targetUid}`);
  redirect(`${LIST_ROUTE}/${targetUid}?op=set_${nextTier}&ok=1`);
}

export async function deleteUserAction(formData: FormData) {
  const targetUid = String(formData.get("uid") ?? "");
  const emailConfirmation = String(formData.get("emailConfirmation") ?? "");
  await deleteCoachlessUser({ uid: targetUid, emailConfirmation });
  revalidatePath(LIST_ROUTE);
  // The user no longer exists — land back on the list, not on a 404.
  redirect(`${LIST_ROUTE}?op=delete_user&ok=1`);
}
