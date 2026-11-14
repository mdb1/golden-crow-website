"use server";

// actions.ts
//
// #382 — the admin console's form actions (formerly inline in page.tsx).
// Inline "use server" closures are named by POSITION ($$RSC_SERVER_ACTION_N),
// so adding or reordering one in the page re-pointed an old tab's action ID at
// a DIFFERENT closure — measured: "promote to admin" ran "add to allowlist".
// Named exports here keep their ID while their name and file don't change.
// Only async functions may be exported from this file (`next build` rejects
// anything else).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { toActionFailure, type ActionResult } from "@/lib/gc-fitness/action-result";

import {
  addCoachEmailToAllowlist,
  deleteCoachCascade,
  promoteUserToAdmin,
  removeCoachEmailFromAllowlist,
} from "@/lib/gc-fitness/admin-actions";

export async function addAllowlistEmailAction(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "");
  try {
    await addCoachEmailToAllowlist(email);
  } catch (err) {
    return toActionFailure(err);
  }
  revalidatePath("/gc-fitness/admin");
  redirect("/gc-fitness/admin?op=allowlist_add&ok=1");
}

export async function promoteToAdminAction(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "");
  try {
    await promoteUserToAdmin({ email, keepTrainer: true });
  } catch (err) {
    return toActionFailure(err);
  }
  revalidatePath("/gc-fitness/admin");
  redirect("/gc-fitness/admin?op=promote_admin&ok=1");
}

export async function removeAllowlistEmailAction(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "");
  try {
    await removeCoachEmailFromAllowlist({ email });
  } catch (err) {
    return toActionFailure(err);
  }
  revalidatePath("/gc-fitness/admin");
  redirect("/gc-fitness/admin?op=allowlist_remove&ok=1");
}

export async function deleteCoachAction(formData: FormData): Promise<ActionResult> {
  const coachUid = String(formData.get("coachUid") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  const mode = String(formData.get("mode") ?? "dry_run");
  try {
    await deleteCoachCascade({ coachUid, confirmation, mode });
  } catch (err) {
    return toActionFailure(err);
  }
  revalidatePath("/gc-fitness/admin");
  redirect("/gc-fitness/admin?op=delete_coach&ok=1");
}
