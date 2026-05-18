// client-roster.ts
//
// Server Action that returns the calling trainer's client roster.
//
// This is a minimal v1 implementation introduced by P04-05 to unblock the
// schedule + bulk-assign UI surfaces. The P02 phase laid down the
// /users/{uid} schema with `role: "client"` + `coachId: <trainerUid>` (see
// `02-04-PLAN.md` line 180 + `02-RESEARCH.md` line 1199) but never shipped
// a Server-Action wrapper around it. P04-05 needs that wrapper:
//
//   - Schedule view: client picker dropdown (no clientId in URL → show roster).
//   - Bulk-assign: multi-select TanStack-Table populated with the same roster.
//
// Why not extend P02's auth-helpers.ts? auth-helpers owns session resolution,
// not a Firestore query. Keeping the roster query in its own module keeps the
// dependency graph linear and lets P05 + P08 + P10 import the helper without
// importing the auth surface.
//
// Threat-register coverage (04-05 PLAN.md):
//   T-04-22 — bulk-assign cross-roster denial. The bulk-assign Server Action
//             could (and should, in v2) cross-check the input clientIds
//             against this roster before constructing the WriteBatch. v1
//             relies on the Firestore rule layer for the truth — but a
//             cross-roster bulk assign would surface as PERMISSION_DENIED
//             on every write, aborting the atomic batch (T-04-22 mitigated
//             by the rule + atomicity). The UI uses this list to keep
//             trainers from seeing other-trainer clients in the first place.
//
// Doc shape (P02 schema):
//   /users/{uid} = {
//     uid: string,
//     email: string,
//     displayName: string,
//     role: "trainer" | "client",
//     coachId: string | null,    // required for clients, null for trainers
//     timezone?: string,         // IANA identifier (P04-06 will populate)
//     ...
//   }

"use server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { getCurrentTrainer } from "./auth-helpers";

export interface ClientRosterEntry {
  uid: string;
  email: string;
  displayName: string;
  timezone: string | null;
}

/**
 * Lists every client whose `coachId` matches the calling trainer's UID.
 *
 * Returns a stable, sorted-by-displayName list — the UI can render it
 * directly into a Select or TanStack-Table without re-sorting.
 *
 * Errors:
 *   - Forbidden → no session / wrong role / not in allowlist
 *
 * v1 caveats:
 *   - No pagination. Cordero's roster is ~5k; a single query returns all
 *     docs, which is fine for trainer-side admin views. v2 may add cursor
 *     pagination if a single trainer's roster exceeds 1k.
 *   - No soft-delete filter at the query layer — clients deleted via the
 *     P02 onUserDeleted flow have their /users doc hard-removed, so there
 *     is no `deleted: true` filter to apply here.
 */
export async function listClients(): Promise<ClientRosterEntry[]> {
  const trainer = await getCurrentTrainer();

  const db = gcFitnessFirestore();
  const snap = await db
    .collection("users")
    .where("coachId", "==", trainer.uid)
    .where("role", "==", "client")
    .get();

  const rows: ClientRosterEntry[] = snap.docs.map((d) => {
    const data = d.data() as {
      email?: string;
      displayName?: string;
      timezone?: string;
    };
    return {
      uid: d.id,
      email: data.email ?? "",
      displayName: data.displayName ?? data.email ?? d.id,
      timezone: typeof data.timezone === "string" ? data.timezone : null,
    };
  });

  rows.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, {
      sensitivity: "base",
    }),
  );

  return rows;
}
