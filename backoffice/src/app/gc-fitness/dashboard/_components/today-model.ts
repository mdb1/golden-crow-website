// today-model.ts — golden-crow-website#535: what the «Inicio» screen lists as
// "do this today", derived from the roster rows the page ALREADY loads (no new
// Firestore read).
//
// Before: the actionable list was at the BOTTOM of the page and only knew one
// reason (no activity in 3+ days) while the KPI tile above it counted six — a
// coach saw "Necesitan atención: 4" and a list of 1. Now the list is the same
// predicate as the tile and the roster filter (`needsAttention`, #499/#513),
// each row says WHY, and money owed has its own card.

import { attentionRank } from "@/lib/gc-fitness/client-attention";
import type { ClientRosterRow } from "@/lib/gc-fitness/client-roster";

/** Flagged active clients, most urgent reason first, then more reasons, then longest silent. */
export function attentionQueue(roster: readonly ClientRosterRow[]): ClientRosterRow[] {
  const lastMs = (r: ClientRosterRow) => (r.lastActivityAt ? Date.parse(r.lastActivityAt) : 0);
  return roster
    .filter((r) => r.source === "active" && r.needsAttention)
    .sort((a, b) => {
      const ra = attentionRank(a.needsAttentionReasons);
      const rb = attentionRank(b.needsAttentionReasons);
      if (ra !== rb) return ra - rb;
      const ca = a.needsAttentionReasons.length;
      const cb = b.needsAttentionReasons.length;
      if (ca !== cb) return cb - ca;
      return lastMs(a) - lastMs(b);
    });
}

export interface PaymentsDue {
  /** Most days late first. */
  overdue: ClientRosterRow[];
  /** Soonest first (inside each plan's «avisarme N días antes» window). */
  dueSoon: ClientRosterRow[];
}

export function paymentsDue(roster: readonly ClientRosterRow[]): PaymentsDue {
  const active = roster.filter((r) => r.source === "active" && r.billing);
  return {
    overdue: active
      .filter((r) => r.billing!.state === "overdue")
      .sort((a, b) => b.billing!.days - a.billing!.days),
    dueSoon: active
      .filter((r) => r.billing!.state === "due_soon")
      .sort((a, b) => a.billing!.days - b.billing!.days),
  };
}
