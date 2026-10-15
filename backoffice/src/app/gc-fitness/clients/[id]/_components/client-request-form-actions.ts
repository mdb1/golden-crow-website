"use server";

// client-request-form-actions.ts
//
// #382 — the weight / progress-photo request button (formerly an inline closure in
// ClientRequestRow.tsx). `clientId` and `kind` arrive through `.bind`, which
// the client can see and alter — `runClientRequest` re-checks that the client
// belongs to the calling coach, so altering them grants nothing.
// Inline "use server" closures are named by POSITION ($$RSC_SERVER_ACTION_N),
// so adding or reordering one in the page re-pointed an old tab's action ID at
// a DIFFERENT closure — measured: "promote to admin" ran "add to allowlist".
// Named exports here keep their ID while their name and file don't change.
// Only async functions may be exported from this file (`next build` rejects
// anything else).

import { revalidatePath } from "next/cache";

import { runClientRequest } from "@/lib/gc-fitness/client-request-actions";
import type { ClientRequestKind } from "@/lib/gc-fitness/client-request-state";

export async function submitClientRequest(
  clientId: string,
  kind: ClientRequestKind,
) {
  await runClientRequest(clientId, kind);
  revalidatePath(`/gc-fitness/clients/${clientId}`);
  revalidatePath("/gc-fitness/my-activity");
}
