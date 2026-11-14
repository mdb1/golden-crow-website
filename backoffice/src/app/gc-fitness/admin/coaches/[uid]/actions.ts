"use server";

// actions.ts
//
// #382 — the coach detail page's form actions (formerly inline in page.tsx).
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
  deactivateClientForCoach,
  deleteClientCascade,
  removePendingClientForCoach,
  transferClientToCoach,
  unlinkClientFromCoach,
} from "@/lib/gc-fitness/admin-actions";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { disableCoach, reactivateCoach } from "@/lib/gc-fitness/coach-access";

export async function deactivateClientAction(formData: FormData): Promise<ActionResult> {
  const coachUid = String(formData.get("coachUid") ?? "");
  const clientUid = String(formData.get("clientUid") ?? "");
  try {
    await deactivateClientForCoach({ coachUid, clientUid });
  } catch (err) {
    return toActionFailure(err);
  }
  revalidatePath(`/gc-fitness/admin/coaches/${coachUid}`);
  return { ok: true };
}

export async function transferClientAction(formData: FormData): Promise<ActionResult> {
  const coachUid = String(formData.get("coachUid") ?? "");
  const clientUid = String(formData.get("clientUid") ?? "");
  const newCoachUid = String(formData.get("newCoachUid") ?? "");
  try {
    await transferClientToCoach({ clientUid, newCoachUid });
  } catch (err) {
    return toActionFailure(err);
  }
  revalidatePath(`/gc-fitness/admin/coaches/${coachUid}`);
  redirect(`/gc-fitness/admin/coaches/${coachUid}?op=transfer_client&ok=1`);
}

export async function unlinkClientAction(formData: FormData): Promise<ActionResult> {
  const coachUid = String(formData.get("coachUid") ?? "");
  const clientUid = String(formData.get("clientUid") ?? "");
  try {
    await unlinkClientFromCoach({ coachUid, clientUid });
  } catch (err) {
    return toActionFailure(err);
  }
  revalidatePath(`/gc-fitness/admin/coaches/${coachUid}`);
  revalidatePath("/gc-fitness/admin/coach-less-users");
  redirect(`/gc-fitness/admin/coaches/${coachUid}?op=unlink_client&ok=1`);
}

export async function removePendingAction(formData: FormData): Promise<ActionResult> {
  const coachUid = String(formData.get("coachUid") ?? "");
  const email = String(formData.get("email") ?? "");
  try {
    await removePendingClientForCoach({ coachUid, email });
  } catch (err) {
    return toActionFailure(err);
  }
  revalidatePath(`/gc-fitness/admin/coaches/${coachUid}`);
  return { ok: true };
}

export async function deleteClientAction(formData: FormData): Promise<ActionResult> {
  const coachUid = String(formData.get("coachUid") ?? "");
  const clientUid = String(formData.get("clientUid") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  // coachUid scopes the cascade: the lib refuses a client that is not this
  // coach's (same ownership read as deactivate / unlink).
  try {
    await deleteClientCascade({ coachUid, clientUid, confirmation, mode: "execute" });
  } catch (err) {
    return toActionFailure(err);
  }
  revalidatePath(`/gc-fitness/admin/coaches/${coachUid}`);
  redirect(`/gc-fitness/admin/coaches/${coachUid}?op=delete_client&ok=1`);
}

// #510 — "Dar de baja como coach" / "Reactivar". Bound per page render with
// `.bind(null, coachUid)`; the lib re-checks the admin gate (the bound value is
// visible to the browser and can be altered).
export async function disableCoachAction(coachUid: string): Promise<ActionResult> {
  try {
    await getCurrentAdmin();
  } catch (err) {
    return toActionFailure(err);
  }
  const result = await disableCoach({ coachUid });
  if (!result.ok) return result;
  revalidatePath(`/gc-fitness/admin/coaches/${coachUid}`);
  revalidatePath("/gc-fitness/admin");
  return { ok: true };
}

export async function reactivateCoachAction(coachUid: string): Promise<ActionResult> {
  try {
    await getCurrentAdmin();
  } catch (err) {
    return toActionFailure(err);
  }
  const result = await reactivateCoach({ coachUid });
  if (!result.ok) return result;
  revalidatePath(`/gc-fitness/admin/coaches/${coachUid}`);
  revalidatePath("/gc-fitness/admin");
  return { ok: true };
}
