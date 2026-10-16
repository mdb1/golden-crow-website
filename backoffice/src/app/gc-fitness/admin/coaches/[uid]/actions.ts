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

import {
  deactivateClientForCoach,
  deleteClientCascade,
  removePendingClientForCoach,
  transferClientToCoach,
  unlinkClientFromCoach,
} from "@/lib/gc-fitness/admin-actions";

export async function deactivateClientAction(formData: FormData) {
  const coachUid = String(formData.get("coachUid") ?? "");
  const clientUid = String(formData.get("clientUid") ?? "");
  await deactivateClientForCoach({ coachUid, clientUid });
  revalidatePath(`/gc-fitness/admin/coaches/${coachUid}`);
}

export async function transferClientAction(formData: FormData) {
  const coachUid = String(formData.get("coachUid") ?? "");
  const clientUid = String(formData.get("clientUid") ?? "");
  const newCoachUid = String(formData.get("newCoachUid") ?? "");
  await transferClientToCoach({ clientUid, newCoachUid });
  revalidatePath(`/gc-fitness/admin/coaches/${coachUid}`);
  redirect(`/gc-fitness/admin/coaches/${coachUid}?op=transfer_client&ok=1`);
}

export async function unlinkClientAction(formData: FormData) {
  const coachUid = String(formData.get("coachUid") ?? "");
  const clientUid = String(formData.get("clientUid") ?? "");
  await unlinkClientFromCoach({ coachUid, clientUid });
  revalidatePath(`/gc-fitness/admin/coaches/${coachUid}`);
  revalidatePath("/gc-fitness/admin/coach-less-users");
  redirect(`/gc-fitness/admin/coaches/${coachUid}?op=unlink_client&ok=1`);
}

export async function removePendingAction(formData: FormData) {
  const coachUid = String(formData.get("coachUid") ?? "");
  const email = String(formData.get("email") ?? "");
  await removePendingClientForCoach({ coachUid, email });
  revalidatePath(`/gc-fitness/admin/coaches/${coachUid}`);
}

export async function deleteClientAction(formData: FormData) {
  const coachUid = String(formData.get("coachUid") ?? "");
  const clientUid = String(formData.get("clientUid") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  // coachUid scopes the cascade: the lib refuses a client that is not this
  // coach's (same ownership read as deactivate / unlink).
  await deleteClientCascade({ coachUid, clientUid, confirmation, mode: "execute" });
  revalidatePath(`/gc-fitness/admin/coaches/${coachUid}`);
  redirect(`/gc-fitness/admin/coaches/${coachUid}?op=delete_client&ok=1`);
}
