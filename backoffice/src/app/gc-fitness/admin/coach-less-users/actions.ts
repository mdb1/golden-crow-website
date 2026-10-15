"use server";

// actions.ts
//
// #382 — the coach-less list's form actions (formerly inline in page.tsx).
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

const ROUTE = "/gc-fitness/admin/coach-less-users";

// Assigning a coach IS a transfer — from no coach to one. `transferClientToCoach`
// already handles the null-coach origin (re-points the doc, moves the chat if
// one exists, resyncs the coachId custom claim), so there's no second code path.
export async function assignCoachAction(formData: FormData) {
  const clientUid = String(formData.get("uid") ?? "");
  const newCoachUid = String(formData.get("newCoachUid") ?? "");
  await transferClientToCoach({ clientUid, newCoachUid });
  revalidatePath(ROUTE);
  revalidatePath(`/gc-fitness/admin/coaches/${newCoachUid}`);
  redirect(`${ROUTE}?op=assign_coach&ok=1`);
}

export async function setTierAction(formData: FormData) {
  const uid = String(formData.get("uid") ?? "");
  const tier = String(formData.get("tier") ?? "");
  await setUserEntitlementTier({ uid, tier });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?op=set_${tier}&ok=1`);
}

export async function deleteUserAction(formData: FormData) {
  const uid = String(formData.get("uid") ?? "");
  const emailConfirmation = String(formData.get("emailConfirmation") ?? "");
  await deleteCoachlessUser({ uid, emailConfirmation });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?op=delete_user&ok=1`);
}
